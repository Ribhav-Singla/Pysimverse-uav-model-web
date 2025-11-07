# Copy Three.js files to public directory for deployment
Write-Host "Copying Three.js files to public directory..."

# Create public/three directory structure
$publicDir = "d:\mujoco_wasm - Copy\public\three"
New-Item -ItemType Directory -Force -Path "$publicDir\build" | Out-Null
New-Item -ItemType Directory -Force -Path "$publicDir\examples\jsm" | Out-Null

# Copy all necessary Three.js build files
Copy-Item "d:\mujoco_wasm - Copy\node_modules\three\build\three.module.js" "$publicDir\build\" -Force
Copy-Item "d:\mujoco_wasm - Copy\node_modules\three\build\three.core.js" "$publicDir\build\" -Force

# Copy examples/jsm directory recursively
Copy-Item "d:\mujoco_wasm - Copy\node_modules\three\examples\jsm\*" "$publicDir\examples\jsm\" -Recurse -Force

Write-Host "Successfully copied Three.js files!"
Write-Host "Update your import map to use: ./public/three/build/three.module.js"
