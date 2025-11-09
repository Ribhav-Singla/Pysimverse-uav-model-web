import * as THREE from 'three';

export function initDroneScene(container) {
  if (!container) return;

  const width = container.clientWidth;
  const height = container.clientHeight;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xffffff);

  const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
  camera.position.set(0, 0, 30);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setSize(width, height);
  renderer.setPixelRatio(window.devicePixelRatio);
  container.appendChild(renderer.domElement);

  // Lighting
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.6);
  directionalLight.position.set(10, 20, 10);
  scene.add(directionalLight);

  const pointLight = new THREE.PointLight(0x00d4ff, 0.4);
  pointLight.position.set(-15, 15, 10);
  scene.add(pointLight);

  // Create Drone
  function createDrone() {
    const droneGroup = new THREE.Group();

    // Body
    const bodyGeometry = new THREE.BoxGeometry(2, 1, 3);
    const bodyMaterial = new THREE.MeshPhongMaterial({ color: 0x1f2937 });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.castShadow = true;
    droneGroup.add(body);

    // Arms and Propellers
    const armPositions = [
      [-3, 0.3, 1],
      [3, 0.3, 1],
      [-3, 0.3, -1],
      [3, 0.3, -1],
    ];

    const propellers = [];

    armPositions.forEach((pos) => {
      // Arm
      const armGeometry = new THREE.CylinderGeometry(0.15, 0.15, 4, 16);
      const armMaterial = new THREE.MeshPhongMaterial({ color: 0x374151 });
      const arm = new THREE.Mesh(armGeometry, armMaterial);
      arm.position.set(pos[0], pos[1], pos[2]);
      arm.rotation.z = Math.PI / 2;
      arm.castShadow = true;
      droneGroup.add(arm);

      // Propeller
      const propGeometry = new THREE.CylinderGeometry(1.5, 1.5, 0.2, 32);
      const propMaterial = new THREE.MeshPhongMaterial({
        color: 0x00d4ff,
        emissive: 0x0099ff,
      });
      const propeller = new THREE.Mesh(propGeometry, propMaterial);
      propeller.position.set(pos[0] + 2, pos[1], pos[2]);
      propeller.castShadow = true;
      droneGroup.add(propeller);
      propellers.push(propeller);
    });

    // Camera
    const cameraGeometry = new THREE.SphereGeometry(0.3, 16, 16);
    const cameraMaterial = new THREE.MeshPhongMaterial({ color: 0x000000 });
    const droneCamera = new THREE.Mesh(cameraGeometry, cameraMaterial);
    droneCamera.position.set(0, -0.5, -1.5);
    droneCamera.castShadow = true;
    droneGroup.add(droneCamera);

    return { group: droneGroup, propellers };
  }

  // Create Trajectory Path
  function createTrajectoryPath() {
    const points = [];
    for (let i = 0; i < 100; i++) {
      const x = Math.sin(i * 0.1) * 15;
      const y = Math.cos(i * 0.05) * 8 + 5;
      const z = Math.sin(i * 0.08) * 12 - 5;
      points.push(new THREE.Vector3(x, y, z));
    }

    const curve = new THREE.CatmullRomCurve3(points);
    const geometry = new THREE.BufferGeometry();
    const positions = curve.getPoints(300);
    geometry.setFromPoints(positions);

    const material = new THREE.LineBasicMaterial({
      color: 0x00d4ff,
      linewidth: 2,
      transparent: true,
      opacity: 0.4,
    });

    const line = new THREE.Line(geometry, material);
    scene.add(line);

    return curve;
  }

  // Create Multiple Drones
  const drones = [];
  for (let i = 0; i < 3; i++) {
    const drone = createDrone();
    drone.group.position.set(
      Math.random() * 20 - 10,
      Math.random() * 10 + 3,
      Math.random() * 20 - 10
    );
    scene.add(drone.group);
    drones.push({
      mesh: drone.group,
      propellers: drone.propellers,
      progress: i * 0.3,
      speed: 0.001 + Math.random() * 0.0005,
    });
  }

  const trajectoryPath = createTrajectoryPath();

  // Animation Loop
  function animate() {
    requestAnimationFrame(animate);

    drones.forEach((drone) => {
      // Update position along path
      drone.progress += drone.speed;
      if (drone.progress > 1) drone.progress = 0;

      const point = trajectoryPath.getPoint(drone.progress);
      drone.mesh.position.copy(point);

      // Update rotation to face direction
      const nextPoint = trajectoryPath.getPoint(Math.min(drone.progress + 0.01, 1));
      const direction = new THREE.Vector3().subVectors(nextPoint, point);
      drone.mesh.lookAt(drone.mesh.position.clone().add(direction));

      // Rotate propellers
      drone.propellers.forEach((propeller) => {
        propeller.rotation.y += 0.3;
      });
    });

    renderer.render(scene, camera);
  }

  // Handle Resize
  function handleResize() {
    if (!container) return;
    const newWidth = container.clientWidth;
    const newHeight = container.clientHeight;

    camera.aspect = newWidth / newHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(newWidth, newHeight);
  }

  window.addEventListener('resize', handleResize);
  animate();

  // Cleanup function
  return () => {
    window.removeEventListener('resize', handleResize);
    if (container.contains(renderer.domElement)) {
      container.removeChild(renderer.domElement);
    }
    renderer.dispose();
  };
}
