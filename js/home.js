let batteryLevel = 100;
let resizeInterval;
window.loadProgress = 0;
window.loadText = "Loading...";
window.isMapLoaded = false;
let isResizing = false;

document.addEventListener('keydown', function (event) {
	if (event.keyCode == 54) {
		if (document.getElementById("overlayTesla").style.display == "block") {
			document.getElementById("overlayTesla").style.display = "none";
		} else {
			document.getElementById("overlayTesla").style.display = "block";
		}
	}
});

function updateStatusBar() {
	if(batteryLevel <= 0) batteryLevel = 0;
	/* Battery Level */
	let newBP = batteryLevel + "%";
	document.getElementById("battery-percentage").textContent = newBP;
	document.getElementById("battery-level").style.width = newBP;
	/* Time (12h format) */
	let currentTime = new Date();
	let hours = currentTime.getHours();
	let minutes = currentTime.getMinutes();
	if (minutes < 10) {
		minutes = "0" + minutes;
	}
	if(hours > 12) {
		hours = hours - 12;
	}
	let AMPM = (currentTime.getHours() >= 12) ? "PM" : "AM";
	let newTime = hours + ":" + minutes + " " + AMPM;
	document.getElementById("time").textContent = newTime;
}

function setLeftSideWidth(newWidth, smooth = false) {
	const mainUI = document.querySelector(".main-ui");
	const leftSide = document.querySelector(".leftSide");
	const rightSide = document.querySelector(".rightSide");

	leftSide.style.width = `${newWidth}px`;
	rightSide.style.width = `calc(100% - ${newWidth}px)`;

	// check if its below 50%, and set it to 50% if it is
	if (newWidth < 0.5 * window.innerWidth) {
		leftSide.style.width = "50%";
		rightSide.style.width = "50%";
	}

	if(newWidth != window.innerWidth && document.querySelector(".minimap-container").classList.contains("visible")) {
		window.hideMinimap();
	} else if(newWidth == window.innerWidth && !document.querySelector(".minimap-container").classList.contains("visible") && !window.isInteractingWithModel) {
		window.showMinimap();
	}

	const factor =
		(newWidth - 0.5 * window.innerWidth) / (0.5 * window.innerWidth);
	const opacity = Math.max(0, factor); // Ensure opacity is not negative
	document.getElementById("navigation-flyout").style.opacity = opacity;

	let newWidthE = window.navigationFlyoutOriginalWidth; // in vw
	let newWidthNum = parseFloat(newWidthE);
	let newWidthPixels = (newWidthNum * window.innerWidth) / 100;

	let newWidthPixelsFactor = newWidthPixels * factor;
	let newWidthVW = (newWidthPixelsFactor / window.innerWidth) * 100;
	if (newWidthVW > 100) newWidthVW = 100;
	if (newWidthVW < 0 || newWidthVW == 0) newWidthVW = 0;
	document.getElementById(
		"navigation-flyout"
	).style.width = `${newWidthVW}vw`;
	// gradually increase the margin-left of the music-flyout to 1vw
	let newMarginLeft = 1 - factor;
	if (newMarginLeft > 1) newMarginLeft = 1;
	if (newMarginLeft < 0 || newMarginLeft == 0) newMarginLeft = 0;
	document.getElementById(
		"music-flyout"
	).style.marginLeft = `${newMarginLeft}vw`;
	window.onWindowResize();
	window.map.resize();
	window.minimap.resize();
}

function smoothSetLeftSideWidth(targetWidth, deltaMP = 0.15) {
	const leftSide = document.querySelector(".leftSide");
	let currentWidth = leftSide.clientWidth;
		function step() {
			const delta = (targetWidth - currentWidth) * deltaMP; // Adjust this value to change the speed of the animation
			currentWidth += delta;

			if (Math.abs(targetWidth - currentWidth) < 1) {
				currentWidth = targetWidth;
				setLeftSideWidth(Math.round(currentWidth));
				clearInterval(resizeInterval); // Stop the interval
				return;
			}

			setLeftSideWidth(Math.round(currentWidth));
		}

	clearInterval(resizeInterval); // Clear any existing interval before starting a new one
	resizeInterval = setInterval(step, 16); // Run the step function every 16 milliseconds (~60 FPS)
}

let initialMouseX = 0;
let initialWidth = 0;

function onMouseDown(e) {
	isResizing = true;
	initialMouseX = e.clientX;
	initialWidth = document.querySelector(".leftSide").clientWidth;
	document.addEventListener("mousemove", onMouseMove);
	document.addEventListener("mouseup", onMouseUp);
}

function onMouseMove(e) {
	if (isResizing) {
		const mainUI = document.querySelector(".main-ui");
		const newWidth = e.clientX - mainUI.offsetLeft;
		setLeftSideWidth(Math.round(newWidth), false);
	}
}

function onMouseUp(e) {
	if (isResizing) {
		isResizing = false;
		const leftSide = document.querySelector(".leftSide");
		const currentWidth = leftSide.clientWidth;
		const deltaX = e.clientX - initialMouseX;
		const deltaVw = (deltaX / window.innerWidth) * 100;

		// Snap points
		const snapPoint50 = 0.5 * window.innerWidth;
		const snapPoint100 = window.innerWidth;

		let targetWidth = currentWidth;

		if (deltaVw > 5) {
			// Right movement
			targetWidth = snapPoint100;
		} else if (deltaVw < -5) {
			// Left movement
			targetWidth = snapPoint50;
		} else {
			// Find the closest snap point
			targetWidth = [snapPoint50, snapPoint100].reduce((prev, curr) =>
				Math.abs(curr - currentWidth) < Math.abs(prev - currentWidth)
					? curr
					: prev
			);
		}

		// Set the width to the target snap point smoothly
		smoothSetLeftSideWidth(Math.round(targetWidth));

		// Remove the event listeners
		document.removeEventListener("mousemove", onMouseMove);
		document.removeEventListener("mouseup", onMouseUp);
	}
}

function updateWeather() {
	const weatherAPI = `https://api.openweathermap.org/data/2.5/weather?lat=${window.lat}&lon=${window.lng}&exclude=minutely,hourly,daily,alerts&units=imperial&lang=en&APPID=${env.OPENWEATHERMAP.TEMP_KEY}`;
	fetch(weatherAPI).then((response) => {
		response.json().then((data) => {
			document.getElementById("temperature").textContent = Math.round(
				data.main.temp
			) + "°F";
		});
	});
}

function toggleApp(appID, force = false) {
	changeAppState(appID, "toggle", force);
}

function openApp(appID, force = false) {
	changeAppState(appID, "open", force);
}

function closeApp(appID) {
	changeAppState(appID, "close");
}

function changeAppState(appID, state = "close", force = false) {
	if(!appID) return;
	const apps = document.querySelectorAll(".app");
	let thisApp;
	for (let i = 0; i < apps.length; i++) {
		thisApp = apps[i];
		if (thisApp.getAttribute("data-appID") == appID || appID=="*") {
			if(state == "open") {
				if (thisApp.classList.contains("app-closed"))
					thisApp.classList.remove("app-closed");
				if (!thisApp.classList.contains("app-open"))
					thisApp.classList.add("app-open");
			} else if(state == "close") {
				if (thisApp.classList.contains("app-open"))
					thisApp.classList.remove("app-open");
				if (!thisApp.classList.contains("app-closed"))
					thisApp.classList.add("app-closed");
			} else if(state == "toggle") {
				if (thisApp.classList.contains("app-open")) {
					thisApp.classList.remove("app-open");
					if(!thisApp.classList.contains("app-closed"))
					thisApp.classList.add("app-closed");
				} else {
					if (thisApp.classList.contains("app-closed"))
						thisApp.classList.remove("app-closed");
					if (!thisApp.classList.contains("app-open"))
						thisApp.classList.add("app-open");
				}
			}
		} else if (force) {
			if (thisApp.classList.contains("app-open"))
				thisApp.classList.remove("app-open");
			if (!thisApp.classList.contains("app-closed"))
				thisApp.classList.add("app-closed");
		}
	}
}


document.addEventListener('DOMContentLoaded', function () {
	if (PersistentStorage.load("isDarkMode")) {
		toggleDarkMode();
	}
	window.navigationFlyoutOriginalWidth =
		(document.getElementById("navigation-flyout").clientWidth /
			window.innerWidth) *
		100;
	setTimeout(() => {
		document.querySelector(".loader").style.opacity = 0;
		document
			.querySelector(".loader")
			.addEventListener("transitionend", function () {
				document.querySelector(".loader").style.display = "none";
				document.querySelector(".loadStageTwo").style.display =
					"inline-block";
				setTimeout(() => {
					document.querySelector(".loadStageTwo").style.display =
						"flex";
					document.querySelector(".loadStageTwo").style.opacity = 1;
				}, 50);
			});
		window.loaderChange = setInterval(() => {
			document.querySelector(".loadText").innerText = window.loadText;
			// set .loaderBar:after width to window.loadProgress%
			if (window.loadProgress > 100) window.loadProgress = 100;
			document.querySelector(".loaderBarFill").style.width =
				window.loadProgress + "%";
			if (window.loadProgress == 100) {
				window.loadText = "Starting...";
				document
					.querySelector(".loaderBarFill")
					.addEventListener("transitionend", function () {
						setTimeout(() => {
							hideLoader();
						}, 5);
					});
			}
		}, 10);
	}, 50);
	updateStatusBar();
	setInterval(updateStatusBar, 1000);
	let tryWeather = setInterval(() => {
		if(window.lat && window.lng) {
			clearInterval(tryWeather);
			updateWeather();
		}
	}, 1);
	setInterval(() => {
		updateWeather();
	}, (60) * 1000);
	// Add mouse events for resizer
	const resizer = document.querySelector(".resizer");
	resizer.addEventListener("mousedown", onMouseDown, false);
	addButtonListeners();
});

function addButtonListeners() {
	// find all elements on the page with data-buttonType attribute
	const buttons = document.querySelectorAll("[data-buttonType]");
	// for each element, add a click event listener and use a switch statement to determine what to do
	buttons.forEach((button) => {
		button.addEventListener("click", function () {
			switch (button.getAttribute("data-buttonType")) {
				case "open-navigation": {
					smoothSetLeftSideWidth(0.5 * window.innerWidth);
					break;
				}
				case "phone": {
					smoothSetLeftSideWidth(0.5 * window.innerWidth);
					toggleApp("phone", true);
					break;
				}
				case "music": {
					smoothSetLeftSideWidth(0.5 * window.innerWidth);
					toggleApp("spotify", true);
					break;
				}
				case "camera": {
					smoothSetLeftSideWidth(0.5 * window.innerWidth);
					toggleApp("camera", true);
					break;
				}
				case "games": {
					smoothSetLeftSideWidth(0.5 * window.innerWidth);
					toggleApp("games", true);
					break;
				}
				case "settings": {
					smoothSetLeftSideWidth(0.5 * window.innerWidth);
					toggleApp("settings", true);
					break;
				}
				case "about": {
					smoothSetLeftSideWidth(0.5 * window.innerWidth);
					toggleApp("settings", true);
					break;
				}
				case "play-pause-playback": {
					togglePlayback();
					break;
				}
				case "skip-song": {
					play();
					break;
				}
				case "previous-song": {
					playPrevious();
					break;
				}
				default: {
					console.error("Unknown button type");
				}
			}
		});
	});
}

function hideLoader() {
	document.querySelector(".loadStageTwo").style.opacity = 0;
	document.getElementById("loading").style.opacity = 0;
	document.getElementById("loading").style.pointerEvents = "none";
	// wait until transition finishes dynamically
	document
		.getElementById("loading")
		.addEventListener("transitionend", function () {
			clearInterval(window.loaderChange);
			document.getElementById("loading").style.display = "none";
		});
}

function toggleDarkMode() {
	const root = document.documentElement;
	const isDarkMode = root.style.getPropertyValue("--theme") === "dark";

	if (isDarkMode) {
		// Switch to light mode
		root.style.setProperty("--theme", "light");
		root.style.setProperty("--cur-bg", "var(--bg-light)");
		root.style.setProperty("--cur-ui", "var(--ui-light)");
		root.style.setProperty("--cur-ui-glassy-A", "var(--ui-light-glassy-A)");
		root.style.setProperty("--cur-ui-glassy-B", "var(--ui-light-glassy-B)");
		root.style.setProperty("--cur-ui-sub", "var(--ui-sub-light)");
		root.style.setProperty("--cur-primary", "var(--primary-light)");
		root.style.setProperty("--cur-sub", "var(--sub-light)");
		root.style.setProperty("--cur-alt", "var(--alt-light)");
	} else {
		// Switch to dark mode
		root.style.setProperty("--theme", "dark");
		root.style.setProperty("--cur-bg", "var(--bg-dark)");
		root.style.setProperty("--cur-ui", "var(--ui-dark)");
		root.style.setProperty("--cur-ui-glassy-A", "var(--ui-dark-glassy-A)");
		root.style.setProperty("--cur-ui-glassy-B", "var(--ui-dark-glassy-B)");
		root.style.setProperty("--cur-ui-sub", "var(--ui-sub-dark)");
		root.style.setProperty("--cur-primary", "var(--primary-dark)");
		root.style.setProperty("--cur-sub", "var(--sub-dark)");
		root.style.setProperty("--cur-alt", "var(--alt-dark)");
	}

	PersistentStorage.save("isDarkMode", !isDarkMode);

	window.themeRefreshRender(isDarkMode);
	window.themeRefreshMap(isDarkMode);
}

document.addEventListener("keydown", (e) => {
	if (e.key === "p") {
		// B key changed to p key for play functionality
		let list = prompt("Enter list for playback:");
		if (list != "" && list != null) {
			list = list.replace("spotify:playlist:", "");
			queuePlaylist(list);
		} else alert("Please enter a valid playlist");
	} else if (e.key === "b") {
		let dS = prompt("Enter destination");
		if (dS != "" && dS != null) {
			window.navigateTo(dS);
		} else alert("Please enter a valid destination");
	} else if (e.key === "d") {
		toggleDarkMode();
	}
});