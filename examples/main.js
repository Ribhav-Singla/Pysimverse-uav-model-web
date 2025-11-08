
import * as THREE           from 'three';
import { GUI              } from 'three/addons/libs/lil-gui.module.min.js';
import { OrbitControls    } from 'three/addons/controls/OrbitControls.js';
import { DragStateManager } from './utils/DragStateManager.js';
import { setupGUI, downloadExampleScenesFolder, loadSceneFromURL, getPosition, getQuaternion, toMujocoPos, standardNormal } from './mujocoUtils.js';
import   load_mujoco        from '../dist/mujoco_wasm.js';

// Load the MuJoCo Module
const mujoco = await load_mujoco();

// Set up Emscripten's Virtual File System
mujoco.FS.mkdir('/working');
mujoco.FS.mount(mujoco.MEMFS, { root: '.' }, '/working');

// Global variable to store current metadata
let currentMetadata = null;
// Global variable to store current trajectory
let currentTrajectory = null;
// Simulation state
let isSimulationRunning = false;
let simulationFrameIndex = 0;
let simulationAnimationId = null;
let simulationFrameCounter = 0;
let simulationSpeed = 3; // Update simulation every N render frames (higher = slower)

export class MuJoCoDemo {
  constructor() {
    this.mujoco = mujoco;

    // Don't load initial model - wait for user to select
    this.model = null;
    this.data  = null;

    // Define Random State Variables
    this.params = { scene: '', paused: false, help: false, ctrlnoiserate: 0.0, ctrlnoisestd: 0.0, keyframeNumber: 0 };
    this.mujoco_time = 0.0;
    this.bodies  = {}, this.lights = {};
    this.tmpVec  = new THREE.Vector3();
    this.tmpQuat = new THREE.Quaternion();
    this.updateGUICallbacks = [];
    
    // Trajectory visualization
    this.trajectoryDots = [];
    this.trajectoryGroup = new THREE.Group();
    this.trajectoryGroup.name = 'trajectoryPath';

    this.container = document.createElement( 'div' );
    document.body.appendChild( this.container );

    this.scene = new THREE.Scene();
    this.scene.name = 'scene';

    this.camera = new THREE.PerspectiveCamera( 45, window.innerWidth / window.innerHeight, 0.001, 100 );
    this.camera.name = 'PerspectiveCamera';
    this.camera.position.set(2.0, 1.7, 1.7);
    this.scene.add(this.camera);

    this.scene.background = new THREE.Color(0.15, 0.25, 0.35);
    this.scene.fog = new THREE.Fog(this.scene.background, 15, 25.5 );

    this.ambientLight = new THREE.AmbientLight( 0xffffff, 0.8 * 3.14 );
    this.ambientLight.name = 'AmbientLight';
    this.scene.add( this.ambientLight );

    this.spotlight = new THREE.SpotLight();
    this.spotlight.angle = 1.11;
    this.spotlight.distance = 10000;
    this.spotlight.penumbra = 0.5;
    this.spotlight.castShadow = true; // default false
    this.spotlight.intensity = this.spotlight.intensity * 3.14 * 30.0;
    this.spotlight.shadow.mapSize.width = 1024; // default
    this.spotlight.shadow.mapSize.height = 1024; // default
    this.spotlight.shadow.camera.near = 0.1; // default
    this.spotlight.shadow.camera.far = 100; // default
    this.spotlight.position.set(0, 3, 3);
    const targetObject = new THREE.Object3D();
    this.scene.add(targetObject);
    this.spotlight.target = targetObject;
    targetObject.position.set(0, 1, 0);
    this.scene.add( this.spotlight );

    this.renderer = new THREE.WebGLRenderer( { antialias: true } );
    this.renderer.setPixelRatio(1.0);////window.devicePixelRatio );
    this.renderer.setSize( window.innerWidth, window.innerHeight );
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; // default THREE.PCFShadowMap
    THREE.ColorManagement.enabled = false;
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    //this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    //this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    //this.renderer.toneMappingExposure = 2.0;
    this.renderer.useLegacyLights = true;

    this.renderer.setAnimationLoop( this.render.bind(this) );

    this.container.appendChild( this.renderer.domElement );

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0.7, 0);
    this.controls.panSpeed = 2;
    this.controls.zoomSpeed = 1;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.10;
    this.controls.screenSpacePanning = true;
    // Prevent camera from going below the surface
    this.controls.maxPolarAngle = Math.PI / 2; // 90 degrees - horizontal limit
    this.controls.minPolarAngle = 0; // 0 degrees - can look straight down from above
    this.controls.update();
    
    // Add trajectory group to scene
    this.scene.add(this.trajectoryGroup);

    window.addEventListener('resize', this.onWindowResize.bind(this));

    // Initialize the Drag State Manager.
    this.dragStateManager = new DragStateManager(this.scene, this.renderer, this.camera, this.container.parentElement, this.controls);
  }

  async init() {
    // Download the examples to MuJoCo's virtual file system (optional, for compatibility)
    await downloadExampleScenesFolder(mujoco);

    // Don't load initial scene - show welcome message instead
    // GUI will be created when first scene is loaded
    this.gui = null;
  }

  // Load an agent scene from the Agents folder
  async loadAgentScene(agentType, obstacleCount) {
    const loadingMessage = document.getElementById('loading-message');
    const metadataDisplay = document.getElementById('metadata-display');
    
    try {
      loadingMessage.textContent = 'Loading scene...';
      loadingMessage.style.color = '#666';
      
      // Clean up all bodies from the scene
      for (let b in this.bodies) {
        if (this.bodies[b]) {
          this.scene.remove(this.bodies[b]);
        }
      }
      this.bodies = {};
      
      // Clean up all lights from the scene (except ambient and spotlight)
      for (let l in this.lights) {
        if (this.lights[l]) {
          this.scene.remove(this.lights[l]);
        }
      }
      this.lights = {};
      
      // Clean up mujocoRoot if it exists
      if (this.mujocoRoot) {
        this.scene.remove(this.mujocoRoot);
        this.mujocoRoot = null;
      }
      
      // Clear trajectory visualization
      this.clearTrajectoryDots();
      
      // Construct the path to the XML and metadata files
      const scenePath = `./Agents/${agentType}/obstacles_${obstacleCount}/map.xml`;
      const metadataPath = `./Agents/${agentType}/obstacles_${obstacleCount}/map_metadata.json`;
      
      // Fetch the XML file
      const xmlResponse = await fetch(scenePath);
      if (!xmlResponse.ok) {
        throw new Error(`Failed to load scene: ${scenePath}`);
      }
      const xmlText = await xmlResponse.text();
      
      // Fetch the metadata file
      const metadataResponse = await fetch(metadataPath);
      if (!metadataResponse.ok) {
        throw new Error(`Failed to load metadata: ${metadataPath}`);
      }
      currentMetadata = await metadataResponse.json();
      
      // Write the XML to the virtual file system
      const sceneFileName = `agent_scene_${agentType}_${obstacleCount}.xml`;
      mujoco.FS.writeFile("/working/" + sceneFileName, xmlText);
      
      // Load the new scene
      [this.model, this.data, this.bodies, this.lights] =
        await loadSceneFromURL(mujoco, sceneFileName, this);
      
      // Update the params
      this.params.scene = sceneFileName;
      
      // Reset simulation time
      this.mujoco_time = 0.0;
      
      // Update GUI
      if (this.gui) {
        this.gui.destroy();
        this.gui = new GUI();
        setupGUI(this);
      }
      
      loadingMessage.textContent = 'Scene loaded successfully!';
      loadingMessage.style.color = '#4CAF50';
      
      // Display metadata
      metadataDisplay.innerHTML = `
        <strong>Scene Information:</strong><br/>
        Agent: ${agentType}<br/>
        Obstacles: ${currentMetadata.obstacle_count}<br/>
        Start: (${currentMetadata.start_position.map(v => v.toFixed(2)).join(', ')})<br/>
        Goal: (${currentMetadata.goal_position.map(v => v.toFixed(2)).join(', ')})
      `;
      metadataDisplay.style.display = 'block';
      
      setTimeout(() => {
        loadingMessage.textContent = '';
      }, 3000);
      
    } catch (error) {
      console.error('Error loading scene:', error);
      loadingMessage.textContent = 'Error loading scene: ' + error.message;
      loadingMessage.style.color = '#f44336';
      metadataDisplay.style.display = 'none';
    }
  }

  // Load trajectory data for the current agent scene
  async loadTrajectory(agentType, obstacleCount) {
    const simulationStatus = document.getElementById('simulation-status');
    
    try {
      const trajectoryPath = `./Agents/${agentType}/obstacles_${obstacleCount}/trajectories/trajectory.json`;
      
      simulationStatus.textContent = 'Loading trajectory...';
      
      const response = await fetch(trajectoryPath);
      if (!response.ok) {
        throw new Error(`Failed to load trajectory: ${trajectoryPath}`);
      }
      
      currentTrajectory = await response.json();
      simulationStatus.textContent = `Trajectory loaded: ${currentTrajectory.length} steps`;
      
      return true;
    } catch (error) {
      console.error('Error loading trajectory:', error);
      simulationStatus.textContent = 'Error loading trajectory: ' + error.message;
      simulationStatus.style.color = '#f44336';
      return false;
    }
  }

  // Clear trajectory dots
  clearTrajectoryDots() {
    // Remove all dots from the scene
    while (this.trajectoryGroup.children.length > 0) {
      this.trajectoryGroup.remove(this.trajectoryGroup.children[0]);
    }
    this.trajectoryDots = [];
  }

  // Add a green dot at the current UAV position
  addTrajectoryDot(position) {
    const dotGeometry = new THREE.SphereGeometry(0.015, 8, 8);
    const dotMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    const dot = new THREE.Mesh(dotGeometry, dotMaterial);
    
    // Convert MuJoCo coordinates to THREE.js coordinates
    // MuJoCo: (x, y, z) -> THREE.js: (x, z, -y)
    dot.position.set(position[0], position[2], -position[1]);
    this.trajectoryGroup.add(dot);
    this.trajectoryDots.push(dot);
  }

  // Run the simulation using trajectory data
  runSimulation() {
    if (!currentTrajectory || currentTrajectory.length === 0) {
      console.error('No trajectory data loaded');
      return;
    }
    
    // Clear previous trajectory visualization
    this.clearTrajectoryDots();
    
    isSimulationRunning = true;
    simulationFrameIndex = 0;
    simulationFrameCounter = 0;
    
    // Pause the normal simulation
    this.params.paused = true;
    
    const simulationStatus = document.getElementById('simulation-status');
    simulationStatus.textContent = 'Simulation starting...';
    simulationStatus.style.color = '#2196F3';
  }

  // Update simulation in the render loop
  updateSimulation() {
    if (!isSimulationRunning || !currentTrajectory) {
      return;
    }
    
    // Only update every N frames to slow down the simulation
    simulationFrameCounter++;
    if (simulationFrameCounter < simulationSpeed) {
      return;
    }
    simulationFrameCounter = 0;
    
    const simulationStatus = document.getElementById('simulation-status');
    
    if (simulationFrameIndex >= currentTrajectory.length) {
      isSimulationRunning = false;
      simulationStatus.textContent = `Simulation completed - ${currentTrajectory.length} steps`;
      simulationStatus.style.color = '#4CAF50';
      document.getElementById('run-simulation-btn').disabled = false;
      document.getElementById('stop-simulation-btn').disabled = true;
      return;
    }
    
    const frame = currentTrajectory[simulationFrameIndex];
    
    // Update UAV position in MuJoCo
    if (frame.position && frame.position.length === 3) {
      // The chassis body is typically body index 1 (body 0 is the world)
      // We can iterate to find it by checking if it has a free joint
      let chassisBodyId = -1;
      
      // Look for the first body with a free joint (that's the UAV chassis)
      for (let b = 1; b < this.model.nbody; b++) {
        const jntAddr = this.model.body_jntadr[b];
        if (jntAddr >= 0 && jntAddr < this.model.njnt) {
          const jntType = this.model.jnt_type[jntAddr];
          // Free joint type is 0
          if (jntType === 0) {
            chassisBodyId = b;
            break;
          }
        }
      }
      
      if (chassisBodyId >= 0) {
        const rootId = this.model.body_rootid[chassisBodyId];
        const jntAddr = this.model.body_jntadr[rootId];
        
        if (jntAddr >= 0 && jntAddr < this.model.njnt) {
          const qposAddr = this.model.jnt_qposadr[jntAddr];
          
          // Set position (x, y, z)
          this.data.qpos[qposAddr + 0] = frame.position[0];
          this.data.qpos[qposAddr + 1] = frame.position[1];
          this.data.qpos[qposAddr + 2] = frame.position[2];
          
          // Set velocity if available (free joint has 6 velocity DOFs)
          if (frame.velocity && frame.velocity.length === 3) {
            const qvelAddr = this.model.jnt_dofadr[jntAddr];
            // Linear velocities (vx, vy, vz)
            this.data.qvel[qvelAddr + 0] = frame.velocity[0];
            this.data.qvel[qvelAddr + 1] = frame.velocity[1];
            this.data.qvel[qvelAddr + 2] = frame.velocity[2];
            // Angular velocities (set to 0 if not provided)
            this.data.qvel[qvelAddr + 3] = 0;
            this.data.qvel[qvelAddr + 4] = 0;
            this.data.qvel[qvelAddr + 5] = 0;
          }
          
          // Update physics to reflect new position and velocity
          mujoco.mj_forward(this.model, this.data);
          
          // Add green dot at current position (every 10 frames to avoid clutter)
          if (simulationFrameIndex % 10 === 0) {
            this.addTrajectoryDot(frame.position);
          }
        }
      }
    }
    
    // Update status with live step counter
    const stepNumber = frame.step !== undefined ? frame.step : simulationFrameIndex;
    const totalSteps = currentTrajectory.length - 1;
    const percentage = ((simulationFrameIndex / currentTrajectory.length) * 100).toFixed(1);
    simulationStatus.textContent = `Running: Step ${stepNumber}/${totalSteps} (${percentage}%)`;
    simulationStatus.style.color = '#2196F3';
    
    // Increment frame index (increase this number to speed up simulation)
    simulationFrameIndex += 1;
  }

  // Stop the simulation
  stopSimulation() {
    isSimulationRunning = false;
    
    const simulationStatus = document.getElementById('simulation-status');
    simulationStatus.textContent = 'Simulation stopped';
    simulationStatus.style.color = '#f44336';
    
    document.getElementById('run-simulation-btn').disabled = false;
    document.getElementById('stop-simulation-btn').disabled = true;
    
    // Resume normal simulation
    this.params.paused = false;
  }

  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize( window.innerWidth, window.innerHeight );
  }

  render(timeMS) {
    this.controls.update();
    
    // Only render if model is loaded
    if (!this.model || !this.data) {
      this.renderer.render(this.scene, this.camera);
      return;
    }
    
    // Update trajectory simulation if running
    if (isSimulationRunning) {
      this.updateSimulation();
    }

    if (!this.params["paused"]) {
      let timestep = this.model.opt.timestep;
      if (timeMS - this.mujoco_time > 35.0) { this.mujoco_time = timeMS; }
      while (this.mujoco_time < timeMS) {

        // Jitter the control state with gaussian random noise
        if (this.params["ctrlnoisestd"] > 0.0) {
          let rate  = Math.exp(-timestep / Math.max(1e-10, this.params["ctrlnoiserate"]));
          let scale = this.params["ctrlnoisestd"] * Math.sqrt(1 - rate * rate);
          let currentCtrl = this.data.ctrl;
          for (let i = 0; i < currentCtrl.length; i++) {
            currentCtrl[i] = rate * currentCtrl[i] + scale * standardNormal();
            this.params["Actuator " + i] = currentCtrl[i];
          }
        }

        // Clear old perturbations, apply new ones.
        for (let i = 0; i < this.data.qfrc_applied.length; i++) { this.data.qfrc_applied[i] = 0.0; }
        let dragged = this.dragStateManager.physicsObject;
        if (dragged && dragged.bodyID) {
          for (let b = 0; b < this.model.nbody; b++) {
            if (this.bodies[b]) {
              getPosition  (this.data.xpos , b, this.bodies[b].position);
              getQuaternion(this.data.xquat, b, this.bodies[b].quaternion);
              this.bodies[b].updateWorldMatrix();
            }
          }
          let bodyID = dragged.bodyID;
          this.dragStateManager.update(); // Update the world-space force origin
          let force = toMujocoPos(this.dragStateManager.currentWorld.clone().sub(this.dragStateManager.worldHit).multiplyScalar(this.model.body_mass[bodyID] * 250));
          let point = toMujocoPos(this.dragStateManager.worldHit.clone());
          mujoco.mj_applyFT(this.model, this.data, [force.x, force.y, force.z], [0, 0, 0], [point.x, point.y, point.z], bodyID, this.data.qfrc_applied);

          // TODO: Apply pose perturbations (mocap bodies only).
        }

        mujoco.mj_step(this.model, this.data);

        this.mujoco_time += timestep * 1000.0;
      }

    } else if (this.params["paused"]) {
      this.dragStateManager.update(); // Update the world-space force origin
      let dragged = this.dragStateManager.physicsObject;
      if (dragged && dragged.bodyID) {
        let b = dragged.bodyID;
        getPosition  (this.data.xpos , b, this.tmpVec , false); // Get raw coordinate from MuJoCo
        getQuaternion(this.data.xquat, b, this.tmpQuat, false); // Get raw coordinate from MuJoCo

        let offset = toMujocoPos(this.dragStateManager.currentWorld.clone()
          .sub(this.dragStateManager.worldHit).multiplyScalar(0.3));
        if (this.model.body_mocapid[b] >= 0) {
          // Set the root body's mocap position...
          console.log("Trying to move mocap body", b);
          let addr = this.model.body_mocapid[b] * 3;
          let pos  = this.data.mocap_pos;
          pos[addr+0] += offset.x;
          pos[addr+1] += offset.y;
          pos[addr+2] += offset.z;
        } else {
          // Set the root body's position directly...
          let root = this.model.body_rootid[b];
          let addr = this.model.jnt_qposadr[this.model.body_jntadr[root]];
          let pos  = this.data.qpos;
          pos[addr+0] += offset.x;
          pos[addr+1] += offset.y;
          pos[addr+2] += offset.z;

          //// Save the original root body position
          //let x  = pos[addr + 0], y  = pos[addr + 1], z  = pos[addr + 2];
          //let xq = pos[addr + 3], yq = pos[addr + 4], zq = pos[addr + 5], wq = pos[addr + 6];

          //// Clear old perturbations, apply new ones.
          //for (let i = 0; i < this.data.qfrc_applied.length; i++) { this.data.qfrc_applied[i] = 0.0; }
          //for (let bi = 0; bi < this.model.nbody; bi++) {
          //  if (this.bodies[b]) {
          //    getPosition  (this.data.xpos, bi, this.bodies[bi].position);
          //    getQuaternion(this.data.xquat, bi, this.bodies[bi].quaternion);
          //    this.bodies[bi].updateWorldMatrix();
          //  }
          //}
          ////dragStateManager.update(); // Update the world-space force origin
          //let force = toMujocoPos(this.dragStateManager.currentWorld.clone()
          //  .sub(this.dragStateManager.worldHit).multiplyScalar(this.model.body_mass[b] * 0.01));
          //let point = toMujocoPos(this.dragStateManager.worldHit.clone());
          //// This force is dumped into xrfc_applied
          //mujoco.mj_applyFT(this.model, this.data, [force.x, force.y, force.z], [0, 0, 0], [point.x, point.y, point.z], b, this.data.qfrc_applied);
          //mujoco.mj_integratePos(this.model, this.data.qpos, this.data.qfrc_applied, 1);

          //// Add extra drag to the root body
          //pos[addr + 0] = x  + (pos[addr + 0] - x ) * 0.1;
          //pos[addr + 1] = y  + (pos[addr + 1] - y ) * 0.1;
          //pos[addr + 2] = z  + (pos[addr + 2] - z ) * 0.1;
          //pos[addr + 3] = xq + (pos[addr + 3] - xq) * 0.1;
          //pos[addr + 4] = yq + (pos[addr + 4] - yq) * 0.1;
          //pos[addr + 5] = zq + (pos[addr + 5] - zq) * 0.1;
          //pos[addr + 6] = wq + (pos[addr + 6] - wq) * 0.1;


        }
      }

      mujoco.mj_forward(this.model, this.data);
    }

    // Update body transforms.
    for (let b = 0; b < this.model.nbody; b++) {
      if (this.bodies[b]) {
        getPosition  (this.data.xpos , b, this.bodies[b].position);
        getQuaternion(this.data.xquat, b, this.bodies[b].quaternion);
        this.bodies[b].updateWorldMatrix();
      }
    }

    // Update light transforms.
    for (let l = 0; l < this.model.nlight; l++) {
      if (this.lights[l]) {
        getPosition(this.data.light_xpos, l, this.lights[l].position);
        getPosition(this.data.light_xdir, l, this.tmpVec);
        this.lights[l].lookAt(this.tmpVec.add(this.lights[l].position));
      }
    }

    // Update tendon transforms.
    let identityQuat = new THREE.Quaternion();
    let numWraps = 0;
    if (this.mujocoRoot && this.mujocoRoot.cylinders) {
      let mat = new THREE.Matrix4();
      for (let t = 0; t < this.model.ntendon; t++) {
        let startW = this.data.ten_wrapadr[t];
        let r = this.model.tendon_width[t];
        for (let w = startW; w < startW + this.data.ten_wrapnum[t] -1 ; w++) {
          let tendonStart = getPosition(this.data.wrap_xpos, w    , new THREE.Vector3());
          let tendonEnd   = getPosition(this.data.wrap_xpos, w + 1, new THREE.Vector3());
          let tendonAvg   = new THREE.Vector3().addVectors(tendonStart, tendonEnd).multiplyScalar(0.5);

          let validStart = tendonStart.length() > 0.01;
          let validEnd   = tendonEnd  .length() > 0.01;

          if (validStart) { this.mujocoRoot.spheres.setMatrixAt(numWraps    , mat.compose(tendonStart, identityQuat, new THREE.Vector3(r, r, r))); }
          if (validEnd  ) { this.mujocoRoot.spheres.setMatrixAt(numWraps + 1, mat.compose(tendonEnd  , identityQuat, new THREE.Vector3(r, r, r))); }
          if (validStart && validEnd) {
            mat.compose(tendonAvg, identityQuat.setFromUnitVectors(
              new THREE.Vector3(0, 1, 0), tendonEnd.clone().sub(tendonStart).normalize()),
              new THREE.Vector3(r, tendonStart.distanceTo(tendonEnd), r));
            this.mujocoRoot.cylinders.setMatrixAt(numWraps, mat);
            numWraps++;
          }
        }
      }

      let curFlexSphereInd = numWraps;
      let tempvertPos = new THREE.Vector3();
      let tempvertRad = new THREE.Vector3();
      for (let i = 0; i < this.model.nflex; i++) {
        for(let j = 0; j < this.model.flex_vertnum[i]; j++) {
          let vertIndex = this.model.flex_vertadr[i] + j;
          getPosition(this.data.flexvert_xpos, vertIndex, tempvertPos);
          let r   = 0.01;
          mat.compose(tempvertPos, identityQuat, tempvertRad.set(r, r, r));

          this.mujocoRoot.spheres.setMatrixAt(curFlexSphereInd, mat);
          curFlexSphereInd++;
        }
      }
      this.mujocoRoot.cylinders.count = numWraps;
      this.mujocoRoot.spheres  .count = curFlexSphereInd;
      this.mujocoRoot.cylinders.instanceMatrix.needsUpdate = true;
      this.mujocoRoot.spheres  .instanceMatrix.needsUpdate = true;
    }

    // Render!
    this.renderer.render( this.scene, this.camera );
  }
}

let demo = new MuJoCoDemo();
await demo.init();

// Set up UI event handlers for agent selection
const agentTypeSelect = document.getElementById('agent-type');
const obstacleCountSelect = document.getElementById('obstacle-count');
const loadSceneButton = document.getElementById('load-scene-btn');
const runSimulationButton = document.getElementById('run-simulation-btn');
const stopSimulationButton = document.getElementById('stop-simulation-btn');
const simulationSpeedSelect = document.getElementById('simulation-speed');

let currentAgentType = '';
let currentObstacleCount = '';

// Handle simulation speed changes
simulationSpeedSelect.addEventListener('change', () => {
  simulationSpeed = parseInt(simulationSpeedSelect.value);
});

// Enable/disable the load button based on selections
function updateLoadButton() {
  const agentSelected = agentTypeSelect.value !== '';
  const obstacleSelected = obstacleCountSelect.value !== '';
  loadSceneButton.disabled = !(agentSelected && obstacleSelected);
}

agentTypeSelect.addEventListener('change', updateLoadButton);
obstacleCountSelect.addEventListener('change', updateLoadButton);

// Handle scene loading
loadSceneButton.addEventListener('click', async () => {
  const agentType = agentTypeSelect.value;
  const obstacleCount = obstacleCountSelect.value;
  
  if (agentType && obstacleCount) {
    loadSceneButton.disabled = true;
    runSimulationButton.disabled = true;
    stopSimulationButton.disabled = true;
    
    // Hide project description on first load
    const projectDescription = document.getElementById('project-description');
    if (projectDescription) {
      projectDescription.style.display = 'none';
    }
    
    await demo.loadAgentScene(agentType, obstacleCount);
    
    // Store current selection
    currentAgentType = agentType;
    currentObstacleCount = obstacleCount;
    
    // Load trajectory data
    const trajectoryLoaded = await demo.loadTrajectory(agentType, obstacleCount);
    
    loadSceneButton.disabled = false;
    runSimulationButton.disabled = !trajectoryLoaded;
    updateLoadButton();
  }
});

// Handle simulation run
runSimulationButton.addEventListener('click', () => {
  runSimulationButton.disabled = true;
  stopSimulationButton.disabled = false;
  demo.runSimulation();
});

// Handle simulation stop
stopSimulationButton.addEventListener('click', () => {
  demo.stopSimulation();
});
