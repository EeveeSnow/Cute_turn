import * as THREE from 'three';
import { io } from 'socket.io-client';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';

class RetroRaceGame {
    constructor() {
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ antialias: false });
        this.players = new Map();
        this.playerCar = null;
        this.speed = 0;
        this.position = { x: 0, y: 0, z: 0 };
        this.lap = 0;
        this.socket = null;
        this.buildings = [];
        this.checkpoints = [];
        this.nextCheckpoint = 0;
        this.carModel = null; // Store the loaded model
        this.loader = new GLTFLoader(); // GLTF loader instance

        // Pixel render target
        this.pixelRatio = 0.3; // Adjust for more/less pixelation
        this.init();
    }

    init() {
        // Setup pixel effect with CRT simulation
        this.renderer.setPixelRatio(this.pixelRatio);
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        document.getElementById('game-container').appendChild(this.renderer.domElement);

        // Setup scene with muted colors
        this.scene.background = new THREE.Color(0x1a1a1a); // Dark gray background
        this.scene.fog = new THREE.FogExp2(0x1a1a1a, 0.008); // Less dense fog for longer view

        // Setup camera with wider view
        this.camera.position.set(0, 8, -15);
        this.camera.lookAt(0, 0, 0);

        // Add atmospheric lighting
        const ambientLight = new THREE.AmbientLight(0x666666, 0.7); // Brighter ambient light
        const moonLight = new THREE.DirectionalLight(0x6666ff, 0.5);
        moonLight.position.set(-50, 100, -50);
        
        // Add spotlights for dramatic lighting
        const spotLight1 = new THREE.SpotLight(0xff69b4, 1);
        spotLight1.position.set(-100, 50, 0);
        spotLight1.angle = Math.PI / 4;
        spotLight1.penumbra = 0.1;
        
        const spotLight2 = new THREE.SpotLight(0x00ffff, 1);
        spotLight2.position.set(100, 50, 0);
        spotLight2.angle = Math.PI / 4;
        spotLight2.penumbra = 0.1;

        this.scene.add(ambientLight, moonLight, spotLight1, spotLight2);

        // Create city background
        this.createCityBackground();
        this.createTrack();

        // Setup event listeners
        window.addEventListener('resize', this.onWindowResize.bind(this));
        document.addEventListener('keydown', this.onKeyDown.bind(this));
        document.addEventListener('keyup', this.onKeyUp.bind(this));
        document.getElementById('start-btn').addEventListener('click', this.startGame.bind(this));
    }

    createCityBackground() {
        // Create distant city silhouettes
        const cityGeometry = new THREE.PlaneGeometry(800, 200);
        const cityMaterial = new THREE.MeshBasicMaterial({
            color: 0x111111,
            transparent: true,
            opacity: 0.9
        });
        const cityBackground = new THREE.Mesh(cityGeometry, cityMaterial);
        cityBackground.position.set(0, 100, -200);
        this.scene.add(cityBackground);

        // Add silhouette buildings in the background
        for (let i = 0; i < 100; i++) {
            const height = Math.random() * 60 + 40;
            const width = Math.random() * 15 + 10;
            const buildingGeometry = new THREE.BoxGeometry(width, height, 2);
            const buildingMaterial = new THREE.MeshBasicMaterial({ 
                color: 0x222222,
                wireframe: false
            });
            const building = new THREE.Mesh(buildingGeometry, buildingMaterial);
            
            // Position buildings along a line in the background
            const x = (Math.random() - 0.5) * 600;
            building.position.set(x, height / 2, -150);
            this.scene.add(building);
        }
    }

    createTrack() {
        // Create ground with grid texture
        const groundSize = 200;
        const gridSize = 40;
        const groundGeometry = new THREE.PlaneGeometry(groundSize, groundSize, gridSize, gridSize);
        const groundMaterial = new THREE.MeshPhongMaterial({ 
            color: 0x222222,
            wireframe: true,
            emissive: 0x111111,
            emissiveIntensity: 0.1
        });
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.rotation.x = -Math.PI / 2;
        this.scene.add(ground);

        // Generate race track
        this.generateRaceTrack();
    }

    generateRaceTrack() {
        // Create a much longer straight track
        const trackPath = [
            [0, -500], [0, 500]  // Rotated track (north-south)
        ];
        
        // Create the main race track
        for (let i = 0; i < trackPath.length - 1; i++) {
            const start = trackPath[i];
            const end = trackPath[i + 1];
            this.createRoadSegment(start[0], start[1], end[0], end[1]);
        }

        // Add buildings along the track
        this.addBuildingsAlongTrack(trackPath);

        // Create start/finish line
        this.createStartFinishLine();

        // Add track limiters
        this.addTrackLimiters(trackPath);
    }

    createRoadSegment(x1, z1, x2, z2) {
        const roadWidth = 25; // Wider road
        const length = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(z2 - z1, 2));
        
        // Create road texture with center line
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');
        
        // Fill with gray color
        ctx.fillStyle = '#444444';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Add center white line
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = canvas.width * 0.02;
        ctx.beginPath();
        ctx.moveTo(canvas.width/2, 0);
        ctx.lineTo(canvas.width/2, canvas.height);
        ctx.stroke();

        // Create texture
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(length/50, 1);
        
        // Create main road
        const roadGeometry = new THREE.PlaneGeometry(roadWidth, length); // Swapped dimensions
        const roadMaterial = new THREE.MeshPhongMaterial({
            map: texture,
            emissive: 0x222222,
            emissiveIntensity: 0.2
        });
        const road = new THREE.Mesh(roadGeometry, roadMaterial);
        road.rotation.x = -Math.PI / 2;
        
        // Add neon strips on road edges
        const stripGeometry = new THREE.PlaneGeometry(1, length); // Swapped dimensions
        const stripMaterial = new THREE.MeshPhongMaterial({
            color: 0xff00ff,
            emissive: 0xff00ff,
            emissiveIntensity: 0.8
        });
        
        const stripLeft = new THREE.Mesh(stripGeometry, stripMaterial);
        stripLeft.position.y = 0.1;
        stripLeft.position.x = roadWidth / 2;
        road.add(stripLeft);
        
        const stripRight = stripLeft.clone();
        stripRight.position.x = -roadWidth / 2;
        road.add(stripRight);

        // Position road segment
        road.position.set(x1, 0.1, (z1 + z2) / 2);
        
        this.scene.add(road);
    }

    createCheckpoint(x, z) {
        const checkpointGeometry = new THREE.BoxGeometry(2, 10, 2);
        const checkpointMaterial = new THREE.MeshPhongMaterial({
            color: 0xffff00,
            wireframe: true,
            emissive: 0xffff00,
            emissiveIntensity: 0.5
        });
        const checkpoint = new THREE.Mesh(checkpointGeometry, checkpointMaterial);
        checkpoint.position.set(x, 5, z);
        this.scene.add(checkpoint);
        return checkpoint;
    }

    createBuilding(x, z, size) {
        const height = Math.random() * 20 + 30; // Taller buildings
        const width = size * 0.8;
        
        // Building body with solid white color
        const buildingGeometry = new THREE.BoxGeometry(width, height, width);
        const buildingMaterial = new THREE.MeshPhongMaterial({
            color: 0xffffff,
            wireframe: false,
            emissive: 0xffffff,
            emissiveIntensity: 0.1
        });
        const building = new THREE.Mesh(buildingGeometry, buildingMaterial);
        building.position.set(x, height / 2, z);
        this.scene.add(building);
        this.buildings.push(building);

        // Add neon strips
        this.addNeonStrips(building, height, width);
    }

    getRandomBuildingColor() {
        const buildingColors = [
            0x222222, // Dark gray
            0x333333, // Medium gray
            0x444444  // Light gray
        ];
        return buildingColors[Math.floor(Math.random() * buildingColors.length)];
    }

    addNeonStrips(building, height, width) {
        const stripColor = this.getRandomNeonColor();
        const stripGeometry = new THREE.BoxGeometry(0.5, height * 0.8, 0.2);
        const stripMaterial = new THREE.MeshPhongMaterial({
            color: stripColor,
            emissive: stripColor,
            emissiveIntensity: 0.8
        });

        // Add vertical neon strips
        for (let i = 0; i < 4; i++) {
            const strip = new THREE.Mesh(stripGeometry, stripMaterial);
            strip.position.x = width/2 * Math.cos(i * Math.PI/2);
            strip.position.z = width/2 * Math.sin(i * Math.PI/2);
            strip.position.y = 0;
            building.add(strip);
        }
    }

    getRandomNeonColor() {
        const neonColors = [
            0xff00ff, // Magenta
            0x00ffff, // Cyan
            0xff3366, // Hot Pink
            0xff6600  // Orange
        ];
        return neonColors[Math.floor(Math.random() * neonColors.length)];
    }

    checkCollisions() {
        if (!this.playerCar) return false;

        const carPosition = this.playerCar.position;
        const carBoundingBox = new THREE.Box3().setFromObject(this.playerCar);

        // Check building collisions
        for (const building of this.buildings) {
            const buildingBox = new THREE.Box3().setFromObject(building);
            if (carBoundingBox.intersectsBox(buildingBox)) {
                return true;
            }
        }

        return false;
    }

    updateGame() {
        if (!this.playerCar) return;

        // Handle gamepad input
        this.handleGamepadInput();

        // Apply drag to slow down the car
        this.speed *= 0.98;

        // Update car position
        const direction = new THREE.Vector3();
        this.playerCar.getWorldDirection(direction);
        
        // Check collisions before moving
        const potentialPosition = this.playerCar.position.clone().add(direction.multiplyScalar(this.speed));
        const oldPosition = this.playerCar.position.clone();
        this.playerCar.position.copy(potentialPosition);
        
        if (this.checkCollisions()) {
            // Collision detected, revert position and reduce speed
            this.playerCar.position.copy(oldPosition);
            this.speed *= -0.5;
        }

        // Check win condition
        this.checkWinCondition();

        // Update camera position with smoother following
        const idealOffset = new THREE.Vector3(0, 8, -15);
        idealOffset.applyQuaternion(this.playerCar.quaternion);
        const idealLookat = new THREE.Vector3(0, 0, 5);
        idealLookat.applyQuaternion(this.playerCar.quaternion);
        
        const t = 0.05; // Smoothing factor
        this.camera.position.lerp(this.playerCar.position.clone().add(idealOffset), t);
        const lookAtPos = this.playerCar.position.clone().add(idealLookat);
        this.camera.lookAt(lookAtPos);

        // Send position to server
        if (this.socket) {
            this.socket.emit('updatePosition', {
                x: this.playerCar.position.x,
                y: this.playerCar.position.y,
                z: this.playerCar.position.z,
                rotation: this.playerCar.rotation.y
            });
        }

        // Update HUD
        document.getElementById('speed-value').textContent = Math.abs(Math.round(this.speed * 100));
    }

    createCar(color = 0xff00ff) {
        return new Promise((resolve) => {
            if (this.carModel) {
                // If we already have the model loaded, clone it
                const carClone = this.carModel.clone();
                this.applyCarColors(carClone, color);
                resolve(carClone);
                return;
            }

            // Load the car model
            this.loader.load(
                '/models/car.glb',
                (gltf) => {
                    const model = gltf.scene;
                    
                    // Store the original model
                    this.carModel = model;
                    
                    // Scale and rotate the model as needed
                    model.scale.set(0.5, 0.5, 0.5);
                    model.rotation.y = Math.PI / 2;
                    
                    // Store original materials
                    this.storeOriginalMaterials(model);
                    
                    // Apply custom colors while preserving textures
                    this.applyCarColors(model, color);
                    
                    // Add underglow
                    const light = new THREE.PointLight(color, 1, 5);
                    light.position.y = -0.5;
                    model.add(light);

                    // Add neon trim effect
                    this.addNeonTrim(model, color);
                    
                    resolve(model);
                },
                (xhr) => {
                    console.log((xhr.loaded / xhr.total * 100) + '% loaded');
                },
                (error) => {
                    console.error('Error loading model:', error);
                    resolve(this.createBasicCar(color));
                }
            );
        });
    }

    storeOriginalMaterials(model) {
        model.traverse((child) => {
            if (child.isMesh) {
                // Store the original material with all its properties
                child.originalMaterial = {
                    material: child.material.clone(),
                    maps: {
                        map: child.material.map,
                        normalMap: child.material.normalMap,
                        roughnessMap: child.material.roughnessMap,
                        metalnessMap: child.material.metalnessMap,
                        emissiveMap: child.material.emissiveMap,
                        aoMap: child.material.aoMap
                    }
                };
            }
        });
    }

    applyCarColors(model, color) {
        const neonColor = new THREE.Color(color);
        const baseColor = new THREE.Color(0x333333);
        
        model.traverse((child) => {
            if (child.isMesh) {
                // Create new material based on original
                const newMaterial = new THREE.MeshPhongMaterial();
                
                // Preserve all original textures
                if (child.originalMaterial) {
                    const maps = child.originalMaterial.maps;
                    Object.keys(maps).forEach(mapType => {
                        if (maps[mapType]) {
                            newMaterial[mapType] = maps[mapType];
                        }
                    });
                }

                // Determine if this part should be neon or base color
                // You might want to adjust this logic based on your model's structure
                const isNeonPart = child.name.toLowerCase().includes('neon') || 
                                 child.name.toLowerCase().includes('light') ||
                                 child.name.toLowerCase().includes('trim');

                // Apply colors while preserving texture influence
                newMaterial.color = isNeonPart ? neonColor : baseColor;
                newMaterial.emissive = isNeonPart ? neonColor : new THREE.Color(0x000000);
                newMaterial.emissiveIntensity = isNeonPart ? 0.5 : 0;
                
                // Preserve material properties
                newMaterial.metalness = 0.8;
                newMaterial.roughness = 0.2;
                newMaterial.envMapIntensity = 1.0;
                
                child.material = newMaterial;
            }
        });
    }

    addNeonTrim(model, color) {
        // Add additional neon effects around the model
        const boundingBox = new THREE.Box3().setFromObject(model);
        const size = boundingBox.getSize(new THREE.Vector3());
        
        const trimGeometry = new THREE.BoxGeometry(size.x * 1.02, 0.05, size.z * 1.02);
        const trimMaterial = new THREE.MeshPhongMaterial({
            color: color,
            emissive: color,
            emissiveIntensity: 0.8,
            transparent: true,
            opacity: 0.8
        });

        // Create bottom trim
        const bottomTrim = new THREE.Mesh(trimGeometry, trimMaterial);
        bottomTrim.position.y = boundingBox.min.y;
        model.add(bottomTrim);

        // Create top trim
        const topTrim = bottomTrim.clone();
        topTrim.position.y = boundingBox.max.y;
        model.add(topTrim);
    }

    createBasicCar(color) {
        // Fallback basic car creation (existing code as fallback)
        const carGroup = new THREE.Group();

        const bodyGeometry = new THREE.BoxGeometry(2, 1, 4);
        const bodyMaterial = new THREE.MeshPhongMaterial({ 
            color: 0x333333,
            wireframe: true
        });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        carGroup.add(body);

        const trimGeometry = new THREE.BoxGeometry(2.2, 0.1, 4.2);
        const trimMaterial = new THREE.MeshPhongMaterial({
            color: color,
            emissive: color,
            emissiveIntensity: 0.8
        });
        const trim = new THREE.Mesh(trimGeometry, trimMaterial);
        trim.position.y = 0.5;
        carGroup.add(trim);

        const light = new THREE.PointLight(color, 1, 5);
        light.position.y = -0.5;
        carGroup.add(light);

        carGroup.position.y = 0.5;
        return carGroup;
    }

    startGame() {
        const playerName = document.getElementById('player-name').value.trim();
        if (!playerName) {
            alert('Please enter your name!');
            return;
        }

        try {
            // Connect to server first
            this.socket = io('http://localhost:3001', {
                reconnectionAttempts: 3,
                timeout: 10000
            });

            this.socket.on('connect', () => {
                console.log('Connected to server');
                // Only start the game after successful connection
                this.initializeGame(playerName);
            });

            this.socket.on('connect_error', (error) => {
                console.error('Connection error:', error);
                alert('Failed to connect to server. Please make sure the server is running!');
            });

            this.socket.on('disconnect', () => {
                console.log('Disconnected from server');
                alert('Lost connection to server!');
            });

            // Disable button while connecting
            const startBtn = document.getElementById('start-btn');
            startBtn.disabled = true;
            startBtn.textContent = 'Connecting...';

        } catch (error) {
            console.error('Error starting game:', error);
            alert('Failed to start game. Please try again.');
        }
    }

    async initializeGame(playerName) {
        document.getElementById('menu').style.display = 'none';
        document.getElementById('hud').style.display = 'block';

        // Create winning screen div
        const winScreen = document.createElement('div');
        winScreen.id = 'win-screen';
        winScreen.style.display = 'none';
        winScreen.style.position = 'fixed';
        winScreen.style.top = '50%';
        winScreen.style.left = '50%';
        winScreen.style.transform = 'translate(-50%, -50%)';
        winScreen.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
        winScreen.style.color = '#ff00ff';
        winScreen.style.padding = '2em';
        winScreen.style.borderRadius = '10px';
        winScreen.style.textAlign = 'center';
        winScreen.style.fontFamily = 'Arial, sans-serif';
        winScreen.style.zIndex = '1000';
        winScreen.innerHTML = '<h1>🏆 WINNER! 🏆</h1><p>You\'ve completed the race!</p>';
        document.body.appendChild(winScreen);

        // Create player car and set initial position
        this.playerCar = await this.createCar();
        this.playerCar.position.set(0, 0.5, -490);
        this.playerCar.rotation.y = Math.PI / 2;
        this.scene.add(this.playerCar);

        // Setup socket listeners for game events
        this.setupSocketListeners();

        // Setup gamepad support
        this.setupGamepadSupport();

        // Start game loop
        this.animate();

        // Send initial player data
        this.socket.emit('playerJoined', { name: playerName });
    }

    setupSocketListeners() {
        this.socket.on('playerJoined', async (data) => {
            if (data.id !== this.socket.id) {
                console.log('New player joined:', data.id);
                const newCar = await this.createCar(0x00ff00);
                this.players.set(data.id, newCar);
                this.scene.add(newCar);
            }
        });

        this.socket.on('playerLeft', (id) => {
            console.log('Player left:', id);
            if (this.players.has(id)) {
                const car = this.players.get(id);
                this.scene.remove(car);
                this.players.delete(id);
            }
        });

        this.socket.on('updatePositions', (data) => {
            Object.entries(data).forEach(([id, pos]) => {
                if (id !== this.socket.id && this.players.has(id)) {
                    const car = this.players.get(id);
                    car.position.set(pos.x, pos.y, pos.z);
                    car.rotation.y = pos.rotation;
                }
            });
        });
    }

    onKeyDown(event) {
        if (!this.playerCar) return;

        switch(event.key) {
            case 'ArrowUp':
            case 'w':
                this.speed = Math.min(this.speed + 0.1, 1);
                break;
            case 'ArrowDown':
            case 's':
                this.speed = Math.max(this.speed - 0.1, -0.5);
                break;
            case 'ArrowLeft':
            case 'a':
                this.playerCar.rotation.y += 0.08;
                break;
            case 'ArrowRight':
            case 'd':
                this.playerCar.rotation.y -= 0.08;
                break;
            case ' ': // Spacebar for handbrake
                this.speed *= 0.9;
                break;
        }
    }

    onKeyUp(event) {
        if (!this.playerCar) return;

        switch(event.key) {
            case 'ArrowUp':
            case 'ArrowDown':
                this.speed *= 0.95;
                break;
        }
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    animate() {
        requestAnimationFrame(this.animate.bind(this));
        this.updateGame();
        this.renderer.render(this.scene, this.camera);
    }

    addBuildingsAlongTrack(trackPath) {
        const start = trackPath[0];
        const end = trackPath[1];
        
        // Calculate direction vector
        const dx = end[0] - start[0];
        const dz = end[1] - start[1];
        const length = Math.sqrt(dx * dx + dz * dz);
        
        // Add buildings on both sides of the track with more variation
        for (let j = 0; j < length; j += 15) { // Closer spacing between buildings
            const t = j / length;
            const z = start[1] + dz * t;
            
            // Random offset for varied building placement
            const offset = Math.random() * 5 + 20;
            
            // Add buildings on both sides of the track
            this.createBuilding(offset, z, 10 + Math.random() * 5);
            this.createBuilding(-offset, z, 10 + Math.random() * 5);
        }
    }

    createStartFinishLine() {
        const lineWidth = 25; // Match road width
        const lineLength = 4;
        const segments = 8;

        // Create checkered texture
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');
        const squareSize = canvas.width / segments;

        for (let i = 0; i < segments; i++) {
            for (let j = 0; j < segments; j++) {
                ctx.fillStyle = (i + j) % 2 === 0 ? '#ff69b4' : '#ffffff';
                ctx.fillRect(i * squareSize, j * squareSize, squareSize, squareSize);
            }
        }

        const texture = new THREE.CanvasTexture(canvas);
        const lineMaterial = new THREE.MeshPhongMaterial({
            map: texture,
            emissive: 0xffffff,
            emissiveIntensity: 0.5
        });

        // Create start line
        const startLineGeometry = new THREE.PlaneGeometry(lineWidth, lineLength);
        const startLine = new THREE.Mesh(startLineGeometry, lineMaterial);
        startLine.rotation.x = -Math.PI / 2;
        startLine.position.set(0, 0.1, -490);
        this.scene.add(startLine);

        // Create finish line
        const finishLine = startLine.clone();
        finishLine.position.set(0, 0.1, 490);
        this.scene.add(finishLine);

        // Add poles
        this.addLinePoles(-490, 'start');
        this.addLinePoles(490, 'finish');
    }

    addLinePoles(z, type) {
        const poleGeometry = new THREE.CylinderGeometry(0.3, 0.3, 10);
        const poleMaterial = new THREE.MeshPhongMaterial({
            color: type === 'start' ? 0xff69b4 : 0x00ff00,
            emissive: type === 'start' ? 0xff69b4 : 0x00ff00,
            emissiveIntensity: 0.5
        });

        const pole1 = new THREE.Mesh(poleGeometry, poleMaterial);
        pole1.position.set(-10, 5, z);
        this.scene.add(pole1);

        const pole2 = pole1.clone();
        pole2.position.set(10, 5, z);
        this.scene.add(pole2);
    }

    setupGamepadSupport() {
        this.gamepadIndex = null;
        window.addEventListener("gamepadconnected", (e) => {
            console.log("Gamepad connected:", e.gamepad);
            this.gamepadIndex = e.gamepad.index;
        });

        window.addEventListener("gamepaddisconnected", (e) => {
            console.log("Gamepad disconnected");
            this.gamepadIndex = null;
        });
    }

    handleGamepadInput() {
        if (this.gamepadIndex !== null) {
            const gamepad = navigator.getGamepads()[this.gamepadIndex];
            if (gamepad) {
                // Left stick or D-pad for steering
                const steerInput = Math.abs(gamepad.axes[0]) > 0.1 ? gamepad.axes[0] : 0;
                this.playerCar.rotation.y -= steerInput * 0.1;

                // Triggers for acceleration/brake
                const acceleration = gamepad.buttons[7].value; // RT
                const brake = gamepad.buttons[6].value; // LT
                
                if (acceleration > 0.1) {
                    this.speed = Math.min(this.speed + acceleration * 0.1, 1);
                }
                if (brake > 0.1) {
                    this.speed = Math.max(this.speed - brake * 0.1, -0.5);
                }
            }
        }
    }

    addTrackLimiters(trackPath) {
        const roadWidth = 25;
        const barrierHeight = 2;
        
        // Create barrier geometry and material
        const barrierGeometry = new THREE.BoxGeometry(1, barrierHeight, 1000);
        const barrierMaterial = new THREE.MeshPhongMaterial({
            color: 0xffffff,
            emissive: 0xffffff,
            emissiveIntensity: 0.2
        });

        // Add right barrier
        const rightBarrier = new THREE.Mesh(barrierGeometry, barrierMaterial);
        rightBarrier.position.set(roadWidth/2 + 0.5, barrierHeight/2, 0);
        this.scene.add(rightBarrier);
        this.buildings.push(rightBarrier);

        // Add left barrier
        const leftBarrier = new THREE.Mesh(barrierGeometry, barrierMaterial);
        leftBarrier.position.set(-(roadWidth/2 + 0.5), barrierHeight/2, 0);
        this.scene.add(leftBarrier);
        this.buildings.push(leftBarrier);
    }

    checkWinCondition() {
        if (!this.playerCar) return;
        
        // Check if player has crossed finish line (z position > 480)
        if (this.playerCar.position.z > 480) {
            document.getElementById('win-screen').style.display = 'block';
            // Optional: Stop the car or reset its position
            this.speed = 0;
        }
    }
}

// Create and start the game
const game = new RetroRaceGame(); 