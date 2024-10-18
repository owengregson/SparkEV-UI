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
import { ReflectorForSSRPass } from "three/addons/objects/ReflectorForSSRPass.js";
import { SSRPass } from "three/addons/postprocessing/SSRPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
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

const vertexShader = await fetch("../glsl/main.vert").then((res) => res.text());
const fragmentShader = await fetch("../glsl/main.frag").then((res) => res.text());

// Initialize Three.js scene
let scene, camera, renderer, controls;
let composer, ssrPass;
let groundReflector;
const selects = [];

let useOrbitControls = true;

// Models configuration
const models = {
	ROADSTER: {
		FLOOR: 0,
		LIGHTS: {
			THESUN: {
				POSITION: { X: -1, Y: 8, Z: -1 },
				INTENSITY: 5,
			},
			GLOBALILLUMINATION: {
				POSITION: { X: 1, Y: 3, Z: 1 },
				INTENSITY: 5,
			},
			TOPLIGHT: {
				POSITION: { X: 0, Y: 5, Z: 0 },
				INTENSITY: 3,
			},
		},
		POSITION: { X: 4.196808, Y: 0.685, Z: 4.424499 },
		ORBIT: { X: 0, Y: 0.685, Z: 0 },
		ROTATION: { YAW: 0, PITCH: 0.8, ROLL: 0 },
	},
};

let currentModel = models.ROADSTER;
let lockedPolarAngle = Math.PI / 2;
let polarAngleFreedom = (lockedPolarAngle * 41) / 180;
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
	const leftSide = document.querySelector(".container");
	let w = leftSide.clientWidth;
	let h = leftSide.clientHeight;
	camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 1000);
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

	// Renderer
	renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
	renderer.setSize(w, h);
	renderer.setPixelRatio(window.devicePixelRatio);
	renderer.shadowMap.enabled = true;
	renderer.shadowMap.type = THREE.PCFSoftShadowMap;
	leftSide.appendChild(renderer.domElement);

	// Lights
	addLights();

	// Floor
	addFloor();

	// GLTF Loader
	loadModel();

	// Post processing
	loadPostProcessing();

	// Resize event listener
	window.addEventListener("resize", onWindowResize, false);
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

    // Initialize groundReflector
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
    groundReflector.visible = false; // Hide the groundReflector mesh
    scene.add(groundReflector);

    // Remove the shadowFloor as it's not needed
    const shadowFloorMaterial = new THREE.ShadowMaterial({ opacity: 0.5 });
    const shadowFloor = new THREE.Mesh(floorGeometry, shadowFloorMaterial);
    shadowFloor.position.y = currentModel.FLOOR;
    shadowFloor.rotation.x = -Math.PI / 2;
    shadowFloor.receiveShadow = true;
    scene.add(shadowFloor);
}

function loadModel() {
	const loader = new GLTFLoader();
	loader.load(
		"../assets/models/roadster/scene.gltf",
		function (gltf) {
			gltf.scene.traverse(function (node) {
				if (node.isMesh) {
					node.castShadow = true;
					node.receiveShadow = true;

					// Add the mesh to the selects array for SSRPass
					selects.push(node);
				}
			});
			scene.add(gltf.scene);
			initControls();
			animate();
		},
		undefined,
		function (error) {
			console.error(error);
		}
	);
}

function loadPostProcessing() {
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

function onWindowResize() {
	const leftSide = document.querySelector(".leftSide");
	let w = leftSide.clientWidth;
	let h = leftSide.clientHeight;
	camera.aspect = w / h;
	camera.updateProjectionMatrix();
	renderer.setSize(w, h);

	// Update the composer and groundReflector sizes
	composer.setSize(w, h);
	groundReflector.getRenderTarget().setSize(w, h);
	groundReflector.resolution.set(w, h);
	controls.update();
}

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

function onStart() {
	clearTimeout(inactivityTimeout);
	window.isInteractingWithModel = true;
}

function onEnd() {
	inactivityTimeout = setTimeout(() => {
		window.isInteractingWithModel = false;
	}, inactivityDelay);
}

function normalizeAngle(angle) {
	while (angle > Math.PI) angle -= 2 * Math.PI;
	while (angle < -Math.PI) angle += 2 * Math.PI;
	return angle;
}

function animate() {
	requestAnimationFrame(animate);
	controls.update();
	composer.render(scene, camera);
}

// Initialize the scene
init();
