// Initialize Three.js scene
let scene,
	camera,
	renderer,
	composer,
	outlinePass,
	fxaaPass,
	renderScene,
	controls;
let useOrbitControls = true;

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { Reflector } from "three/addons/objects/Reflector.js";
import { FXAAShader } from "three/addons/shaders/FXAAShader.js";
import { OutlinePass } from "three/addons/postprocessing/OutlinePass.js";
import WebGPU from "three/addons/capabilities/WebGPU.js";
import WebGL from "three/addons/capabilities/WebGL.js";
import WebGPURenderer from "three/addons/renderers/webgpu/WebGPURenderer.js";
import PostProcessing from "three/addons/renderers/common/PostProcessing.js";
import {
	MeshPhongNodeMaterial,
	color,
	pass,
	reflector,
	normalWorld,
	texture,
	uv,
	viewportTopLeft,
} from "three/nodes";
import { ReflectorForSSRPass } from "three/addons/objects/ReflectorForSSRPass.js";
import { SSRPass } from "three/addons/postprocessing/SSRPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

let moveForward = false;
let moveBackward = false;
let moveLeft = false;
let moveRight = false;
let moveUp = false;
let moveDown = false;
let rotateYawLeft = false;
let rotateYawRight = false;
let rotatePitchUp = false;
let rotatePitchDown = false;
let rotateRollLeft = false;
let rotateRollRight = false;

const moveSpeed = 3;
const rotateSpeed = 0.005;
const wFactor = 1;
const hFactor = 1.945;
let w = window.innerWidth / wFactor;
let h = w / hFactor;

const ENTIRE_SCENE = 0,
	BLOOM_SCENE = 1;
const bloomLayer = new THREE.Layers();
bloomLayer.set(BLOOM_SCENE);

const materials = {};
const darkMaterial = new THREE.MeshBasicMaterial({ color: "black" });
let groundReflector, ssrPass;
const selects = [];

const models = {
	ROADSTER: {
		FLOOR: 0,
		LIGHTS: {
			THESUN: {
				POSITION: {
					X: -1,
					Y: 8,
					Z: -1,
				},
				INTENSITY: 5,
			},
			GLOBALILLUMINATION: {
				POSITION: {
					X: 1,
					Y: 3,
					Z: 1,
				},
				INTENSITY: 5,
			},
			TOPLIGHT: {
				POSITION: {
					X: 0,
					Y: 5,
					Z: 0,
				},
				INTENSITY: 3,
			},
		},
		POSITION: {
			X: 4.196808,
			Y: 0.685,
			Z: 4.424499,
		},
		ORBIT: {
			X: 0,
			Y: 0.685,
			Z: 0,
		},
		ROTATION: {
			YAW: 0,
			PITCH: 0.8,
			ROLL: 0,
		},
	},
	MODEL3: {
		FLOOR: -75,
		LIGHTS: {
			THESUN: {
				POSITION: {
					X: -400,
					Y: 300,
					Z: -400,
				},
				INTENSITY: 2,
			},
			GLOBALILLUMINATION: {
				POSITION: {
					X: 400,
					Y: 300,
					Z: 400,
				},
				INTENSITY: 2,
			},
			TOPLIGHT: {
				POSITION: {
					X: 0,
					Y: 500,
					Z: 0,
				},
				INTENSITY: 2,
			},
		},
		POSITION: {
			X: -443.8641,
			Y: 5.685,
			Z: -527.6811,
		},
		ORBIT: {
			X: 0,
			Y: 5.685,
			Z: -40,
		},
		ROTATION: {
			YAW: -3.1416,
			PITCH: -0.735,
			ROLL: 3.1416,
		},
	},
	SPARK: {
		FLOOR: 0,
		LIGHTS: {
			THESUN: {
				POSITION: {
					X: 0,
					Y: 0,
					Z: 0,
				},
				INTENSITY: 1,
			},
			GLOBALILLUMINATION: {
				POSITION: {
					X: 0,
					Y: 0,
					Z: 0,
				},
				INTENSITY: 1,
			},
			TOPLIGHT: {
				POSITION: {
					X: 0,
					Y: 0,
					Z: 0,
				},
				INTENSITY: 1,
			},
		},
		POSITION: {
			X: 0,
			Y: 0,
			Z: 0,
		},
		ORBIT: {
			X: 0,
			Y: 0,
			Z: 0,
		},
		ROTATION: {
			YAW: 0,
			PITCH: 0,
			ROLL: 0,
		},
	},
};

let currentModel = models.ROADSTER;
let lockedPolarAngle = Math.PI / 2;
let polarAngleFreedom = /* 30 degrees above lockedPolarAngle */ (lockedPolarAngle * 41) / 180;
let desiredResetAngle = normalizeAngle(currentModel.ROTATION.PITCH);
const inactivityDelay = 2500; // 5 seconds
let inactivityTimeout;
window.isInteractingWithModel = false;

function init() {
	// Scene
	scene = new THREE.Scene();
	scene.background = new THREE.Color(0xf4f4f4);
	scene.fog = new THREE.Fog(0xe4e4e4, 7, 20);

	// Camera
	const leftSide = document.querySelector(".leftSide");
	w = leftSide.clientWidth;
	h = leftSide.clientHeight;
	camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 1000);
	// determine the camera position and rotation based on the currentModel
	camera.position.set(
		currentModel.POSITION.X,
		currentModel.POSITION.Y,
		currentModel.POSITION.Z
	);
	camera.rotation.set(
		currentModel.ROTATION.YAW,
		currentModel.ROTATION.PITCH,
		currentModel.ROTATION.ROLL
	);
	window.loadProgress += 5;

	// Renderer
	renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
	renderer.setSize(w, h);
	renderer.setPixelRatio(window.devicePixelRatio);
	renderer.shadowMap.enabled = true;
	renderer.shadowMap.type = THREE.PCFSoftShadowMap;

	// Append renderer to the main-ui div
	leftSide.appendChild(renderer.domElement);

	// Lights

	addLights();

	window.loadProgress += 5;

	addFloor();

	window.loadProgress += 5;

	// GLTF Loader*/
	const loader = new GLTFLoader();
	loader.load(
		"../assets/models/" +
			Object.keys(models)[
				Object.values(models).indexOf(currentModel)
			].toLowerCase() +
			"/scene.gltf",
		function (gltf) {
			gltf.scene.traverse(function (node) {
				if (node.isMesh) {
					node.castShadow = true;
					node.receiveShadow = true;
					node.layers.enable(BLOOM_SCENE); // Enable bloom for the car model
					selects.push(node);
				}
			});
			scene.add(gltf.scene);
			initPostProcessing();
			initControls();
			animate();
		},
		undefined,
		function (error) {
			console.error(error);
		}
	);

	window.loadProgress += 15;

	// Resize event listener
	window.addEventListener("resize", onWindowResize, false);
	document.addEventListener("keydown", onDocumentKeyDown, false);
	document.addEventListener("keyup", onDocumentKeyUp, false);
	document.addEventListener("keydown", onExportKeyPress, false); // Add keydown event listener for exporting camera position and rotation
}

function addLights() {
	const sunLight = new THREE.DirectionalLight(0xffffff, 6);
	sunLight.shadow.camera.left = -8;
	sunLight.shadow.camera.right = 8;
	sunLight.shadow.camera.top = 8;
	sunLight.shadow.camera.bottom = -8;
	sunLight.shadow.camera.near = 0.5;
	sunLight.shadow.camera.far = 80;
	sunLight.shadow.mapSize.width = 512;
	sunLight.shadow.mapSize.height = 512;
	sunLight.shadow.bias = -0.0001;
	sunLight.shadow.blurSamples = 500;
	sunLight.castShadow = true;
	sunLight.position.set(0.5, 3, 0.5);
	scene.add(sunLight);
}

function addFloor() {
	const floorGeometry = new THREE.CircleGeometry(20, 64);

	groundReflector = new ReflectorForSSRPass(floorGeometry, {
		clipBias: 0.0003,
		textureWidth: window.innerWidth,
		textureHeight: window.innerHeight,
		color: 0x888888,
		useDepthTexture: true,
	});
	groundReflector.material.depthWrite = false;
	groundReflector.rotation.x = -Math.PI / 2;
	groundReflector.position.y = currentModel.FLOOR;
	groundReflector.visible = false; // Hide the ground reflector mesh
	scene.add(groundReflector);

	const shadowFloorMaterial = new THREE.ShadowMaterial({ opacity: 0.5 });
	const shadowFloor = new THREE.Mesh(floorGeometry, shadowFloorMaterial);
	shadowFloor.position.y = currentModel.FLOOR;
	shadowFloor.rotation.x = -Math.PI / 2;
	shadowFloor.receiveShadow = true;
	scene.add(shadowFloor);
}

window.onWindowResize = function () {
	onWindowResize();
};

let smoothPolar = false;
let desiredPolarAngle;
let scale1 = false;

function onWindowResize() {
	const leftSide = document.querySelector(".leftSide");
	w = leftSide.clientWidth;
	h = leftSide.clientHeight;
	camera.aspect = w / h;
	camera.updateProjectionMatrix();
	renderer.setSize(w, h);
	groundReflector.getRenderTarget().setSize(w, h);
	groundReflector.resolution.set(w, h);
	/* Scale Changes */
	const newSizeX = (1 - (1 - 0.3) * (1 - w / window.innerWidth));
	const newSizeY = (1 - (1 - 0.3) * (1 - w / window.innerWidth));
	const newSizeZ = (1 - (1 - 0.3) * (1 - w / window.innerWidth));
	scale1 = (newSizeX < 1.02 && newSizeX > 0.98);
	scene.scale.set(newSizeX, newSizeY, newSizeZ);
	/* Angle Changes */
	const newPolarAngle = 1.0;
	lockedPolarAngle = Math.PI / 2 - (Math.PI / 2 - newPolarAngle) * (1 - w / window.innerWidth);
	desiredPolarAngle = lockedPolarAngle;
	// if the lockedPolarAngle is Math.PI/2, then give it the 41 degrees of freedom above the lockedAngle. Otherwise, the freedom is zero.
	polarAngleFreedom = lockedPolarAngle === Math.PI / 2 ? (lockedPolarAngle * 41) / 180 : 0;
	smoothPolar = true;
	smoothAdjustPolarAngle(lockedPolarAngle);
	/*controls.minPolarAngle = lockedPolarAngle - polarAngleFreedom;
	controls.maxPolarAngle = lockedPolarAngle;*/

	/* Map Changes */
	// when the leftSide at 100% width, the map should be at 0% opacity
	// when the leftSide at 50% width, the map should be at 100% opacity
	let opacity = (1 - 0) * (1 - w / window.innerWidth)*2;
	document.querySelector(".map").style.opacity = opacity;

	controls.update();
}

let smoothReset = false;

function initControls() {
	controls = new OrbitControls(camera, renderer.domElement);
	controls.enableDamping = true;
	controls.dampingFactor = 0.07;
	controls.rotateSpeed = 0.48;
	controls.enablePan = false;
	controls.enableRotate = true;
	controls.enableZoom = false;
	controls.target.set(
		currentModel.ORBIT.X,
		currentModel.ORBIT.Y,
		currentModel.ORBIT.Z
	);
	controls.minPolarAngle = lockedPolarAngle - polarAngleFreedom; // Allow freedom upward
	controls.maxPolarAngle = lockedPolarAngle; // Lock angle at the top position

	controls.addEventListener("start", onStart);
	controls.addEventListener("end", onEnd);
}

function onStart(event) {
	controls.minAzimuthAngle = -Infinity;
	controls.maxAzimuthAngle = Infinity;
	controls.minPolarAngle = lockedPolarAngle - polarAngleFreedom; // Allow freedom upward
	controls.maxPolarAngle = lockedPolarAngle; // Lock angle at the top position
	if (!window.isInteractingWithModel) {
		window.hideMinimap();
	}
	smoothReset = false;
	window.isInteractingWithModel = true;

	// Clear the inactivity timeout if the user is active
	clearTimeout(inactivityTimeout);
}

function onEnd(event) {
	// Set the inactivity timeout to trigger the reset after 5 seconds of inactivity
	inactivityTimeout = setTimeout(() => {
		smoothReset = true;
	}, inactivityDelay);
}

function normalizeAngle(angle) {
	while (angle > Math.PI) angle -= 2 * Math.PI;
	while (angle < -Math.PI) angle += 2 * Math.PI;
	return angle;
}

function doSmoothReset(desiredAngle) {
	const targetAzimuthAngle = desiredAngle;
	const targetPolarAngle = lockedPolarAngle;

	let currentAzimuthAngle = normalizeAngle(controls.getAzimuthalAngle());
	let currentPolarAngle = controls.getPolarAngle();

	if (Math.abs(currentAzimuthAngle - targetAzimuthAngle) < 0.001) {
		currentAzimuthAngle = targetAzimuthAngle;
	}

	if (Math.abs(currentPolarAngle - targetPolarAngle) < 0.001) {
		currentPolarAngle = targetPolarAngle;
	}

	const smoothFactor = 0.05;
	const newAzimuthAngle =
		currentAzimuthAngle +
		smoothFactor * (targetAzimuthAngle - currentAzimuthAngle);
	const newPolarAngle =
		currentPolarAngle +
		smoothFactor * (targetPolarAngle - currentPolarAngle);

	controls.minAzimuthAngle = newAzimuthAngle;
	controls.maxAzimuthAngle = newAzimuthAngle;
	controls.minPolarAngle = newPolarAngle;
	controls.maxPolarAngle = newPolarAngle;

	controls.update(); // Update the controls to apply the changes

	if (
		Math.abs(currentAzimuthAngle - targetAzimuthAngle) < 0.001 &&
		Math.abs(currentPolarAngle - targetPolarAngle) < 0.001) {
		onStart();
		smoothReset = false;
		if (window.isInteractingWithModel) {
			window.showMinimap();
		}
		window.isInteractingWithModel = false;
	}
}

function smoothAdjustPolarAngle(newAngle) {
	if (!smoothPolar) return;
	const targetPolarAngle = newAngle;
	let currentPolarAngle = controls.getPolarAngle();

	if (Math.abs(currentPolarAngle - targetPolarAngle) < 0.001) {
		currentPolarAngle = targetPolarAngle;
	}

	const smoothFactor = 0.05;
	const newPolarAngle =
		currentPolarAngle +
		smoothFactor * (targetPolarAngle - currentPolarAngle);

	controls.minPolarAngle = newPolarAngle;
	controls.maxPolarAngle = newPolarAngle;

	controls.update(); // Update the controls to apply the changes

	if (Math.abs(currentPolarAngle - targetPolarAngle) < 0.001 || scale1) {
		smoothPolar = false;
	}

}

function animationLoop(t) {
	if (smoothReset) {
		doSmoothReset(desiredResetAngle);
	}

	if (smoothPolar) {
		smoothAdjustPolarAngle(desiredPolarAngle);
	}

	if (useOrbitControls) {
		controls.update(); // Update controls in the animation loop
	} else {
		updateCamera(); // Update camera for WASD controls
	}
	composer.render();
}

function initPostProcessing() {
	const scenePass = pass(scene, camera);
	const scenePassColor = scenePass.getTextureNode();
	const scenePassDepth = scenePass.getDepthNode().remapClamp(0.3, 0.5);

	const scenePassColorBlurred = scenePassColor.gaussianBlur();
	scenePassColorBlurred.directionNode = scenePassDepth;

	const vignet = viewportTopLeft.distance(0.5).mul(1.35).clamp().oneMinus();

	let postProcessing = new PostProcessing(renderer);
	postProcessing.outputNode = scenePassColorBlurred.mul(vignet);

	// Initialize the EffectComposer
	composer = new EffectComposer(renderer);

	// Initialize the SSRPass
	ssrPass = new SSRPass({
		renderer,
		scene,
		camera,
		width: window.innerWidth,
		height: window.innerHeight,
		groundReflector: groundReflector, // Use the groundReflector from addFloor()
		selects: selects, // Use the selects array from addFloor()
	});

	// Configure SSRPass properties
	ssrPass.thickness = 0.518;
	ssrPass.infiniteThick = true;
	ssrPass.maxDistance = 0.01;
	ssrPass.opacity = 0.95;
	ssrPass.blur = true;
	ssrPass.fresnel = true;
	ssrPass.distanceAttenuation = true;
	ssrPass.bouncing = true;

	// Match groundReflector properties to ssrPass
	//groundReflector.maxDistance = 0.006
	groundReflector.opacity = ssrPass.opacity;
	groundReflector.fresnel = ssrPass.fresnel;
	groundReflector.distanceAttenuation = ssrPass.distanceAttenuation;

	// Add the passes to the composer
	composer.addPass(ssrPass);
	composer.addPass(new OutputPass());
}

function animate() {
	requestAnimationFrame(animate);
	animationLoop();
}

function updateCamera() {
	const direction = new THREE.Vector3();
	camera.getWorldDirection(direction);

	if (moveForward) {
		camera.position.addScaledVector(direction, moveSpeed);
	}
	if (moveBackward) {
		camera.position.addScaledVector(direction, -moveSpeed);
	}

	const right = new THREE.Vector3();
	right.crossVectors(camera.up, direction).normalize();

	if (moveLeft) {
		camera.position.addScaledVector(right, moveSpeed);
	}
	if (moveRight) {
		camera.position.addScaledVector(right, -moveSpeed);
	}
	if (moveUp) {
		camera.position.y += moveSpeed;
	}
	if (moveDown) {
		camera.position.y -= moveSpeed;
	}

	if (rotateYawLeft) camera.rotation.y -= rotateSpeed;
	if (rotateYawRight) camera.rotation.y += rotateSpeed;
	if (rotatePitchUp) camera.rotation.x -= rotateSpeed;
	if (rotatePitchDown) camera.rotation.x += rotateSpeed;
	if (rotateRollLeft) camera.rotation.z -= rotateSpeed;
	if (rotateRollRight) camera.rotation.z += rotateSpeed;
}

// Event handlers for keydown and keyup events
function onDocumentKeyDown(event) {
	/*switch (event.code) {
		case "Digit1":
			useOrbitControls = true;
			initControls();
			break;
		case "Digit2":
			useOrbitControls = false;
			controls.dispose();
			break;
		case "KeyW":
			moveForward = true;
			break;
		case "KeyS":
			moveBackward = true;
			break;
		case "KeyA":
			moveLeft = true;
			break;
		case "KeyD":
			moveRight = true;
			break;
		case "Space":
			moveUp = true;
			break;
		case "ShiftLeft":
		case "ShiftRight":
			moveDown = true;
			break;
		case "KeyJ":
			rotateYawLeft = true;
			break;
		case "KeyL":
			rotateYawRight = true;
			break;
		case "KeyI":
			rotatePitchUp = true;
			break;
		case "KeyK":
			rotatePitchDown = true;
			break;
		case "KeyM":
			rotateRollLeft = true;
			break;
		case "KeyN":
			rotateRollRight = true;
			break;
	}*/
}

function onDocumentKeyUp(event) {
	/*switch (event.code) {
		case "KeyW":
			moveForward = false;
			break;
		case "KeyS":
			moveBackward = false;
			break;
		case "KeyA":
			moveLeft = false;
			break;
		case "KeyD":
			moveRight = false;
			break;
		case "Space":
			moveUp = false;
			break;
		case "ShiftLeft":
		case "ShiftRight":
			moveDown = false;
			break;
		case "KeyJ":
			rotateYawLeft = false;
			break;
		case "KeyL":
			rotateYawRight = false;
			break;
		case "KeyI":
			rotatePitchUp = false;
			break;
		case "KeyK":
			rotatePitchDown = false;
			break;
		case "KeyM":
			rotateRollLeft = false;
			break;
		case "KeyN":
			rotateRollRight = false;
			break;
	}*/
}

// Function to export camera position and rotation
function onExportKeyPress(event) {
	/*if (event.code === "KeyE") {
		// Press 'E' to export
		console.log("Camera Position:", camera.position);
		console.log("Camera Rotation:", camera.rotation);
	}*/
}

// Initialize the scene
window.loadText = "Loading 3D engine...";
init();
document.addEventListener("keydown", onDocumentKeyDown, false);
document.addEventListener("keyup", onDocumentKeyUp, false);

window.loadText = "Loading navigation...";
// TODO: make this less ass at some point
let mapChecker = setInterval(() => {
	if (window.isMapLoaded && window.map.isStyleLoaded()) {
		clearInterval(mapChecker);
		window.loadProgress += 30;
		window.loadText = "Loading integrations...";
		let spotifyChecker = setInterval(() => {
			if (window.isSpotifyLoaded) {
				clearInterval(spotifyChecker);
				window.loadProgress = 99;
				setTimeout(() => {
					window.loadProgress += 1;
				}, 500);
			}
		}, 5);
	}
}, 5);

window.themeRefreshRender = function (isLightMode) {
	console.log("isLightMode: " + isLightMode);
	scene.traverse((child) => {
		if (child.isLight) {
			child.intensity = isLightMode ? child.intensity * 5 : child.intensity * 0.2;
		}
	});
}