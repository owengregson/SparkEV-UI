let accessToken = null;
let activeDeviceId = null;
window.isSpotifyLoaded = false;
let player;
let isPlaying = false;
window.progressInterval; // Use a global variable to store the interval ID

class Song {
	constructor(
		name,
		iconUrl,
		artists,
		album,
		uri,
		progress = 0,
		duration = 0
	) {
		this.name = name;
		this.icon = iconUrl || "../assets/images/album-cover.png";
		this.artists = typeof artists === "string" ? [artists] : artists;
		this.album = album;
		this.uri = uri.startsWith("spotify:track:")
			? uri
			: `spotify:track:${uri}`;
		this.progress = progress;
		this.duration = duration;
	}

	getName() {
		return this.name;
	}

	getIcon() {
		return this.icon;
	}

	getArtists() {
		return this.artists.join(", ");
	}

	getAlbum() {
		return this.album;
	}

	getUri() {
		return this.uri;
	}

	toString() {
		return `${this.name} by ${this.getArtists()} from ${this.getAlbum()}`;
	}

	getProgressPercentage() {
		return (this.progress / this.duration) * 100;
	}

	static fromJSON(json) {
		return new Song(
			json.name,
			json.album.images[0]?.url,
			json.artists.map((artist) => artist.name),
			json.album.name,
			json.uri,
			json.progress_ms,
			json.duration_ms
		);
	}
}

class Playlist {
	constructor() {
		this.queue = [];
		this.past = [];
		this.current = null;
	}

	add(song) {
		this.queue.push(song);
	}

	pop() {
		if (this.current) {
			this.past.push(this.current);
		}
		this.current = this.queue.shift();
		return this.current;
	}

	getPrevious() {
		if (this.past.length > 0) {
			this.queue.unshift(this.current);
			this.current = this.past.pop();
			return this.current;
		}
		return null;
	}

	getNext() {
		if (this.queue.length > 0) {
			this.past.push(this.current);
			this.current = this.queue.shift();
			return this.current;
		}
		return null;
	}

	remove(index) {
		this.queue.splice(index, 1);
	}

	clear() {
		this.queue = [];
		this.past = [];
		this.current = null;
	}

	getQueue() {
		return this.queue;
	}

	isEmpty() {
		return this.queue.length === 0 && !this.current;
	}

	toString() {
		return this.queue.map((song) => song.toString()).join("\n");
	}
}

const playlist = new Playlist();

function showOAuthPopup() {
	const clientId = env.SPOTIFY.ID;
	const redirectUri = "http://127.0.0.1:3000/html/oauthHandler.html";
	const scopes =
		"streaming app-remote-control user-read-currently-playing user-read-playback-state user-modify-playback-state user-library-read user-read-playback-position user-top-read user-read-recently-played user-follow-read playlist-read-private";
	const url = `https://accounts.spotify.com/authorize?client_id=${clientId}&response_type=token&redirect_uri=${redirectUri}&scope=${scopes}`;
	let computedWidth = window.innerWidth / 2;
	let computedHeight = window.innerHeight / 2.5;
	PersistentStorage.save("spotify_token", null);
	PersistentStorage.save("spotify_token_created", null);
	window.open(url, "", `height=${computedWidth},width=${computedHeight}`);
	let tokenChecker = setInterval(() => {
		if (PersistentStorage.load("spotify_token")) {
			clearInterval(tokenChecker);
			accessToken = PersistentStorage.load("spotify_token");
			window.onTokenReceived();
		}
	}, 10);
}

function getAccessToken() {
	const tokenCreated = PersistentStorage.load("spotify_token_created");
	const tokenExpiry = tokenCreated + 3600000;
	if (Date.now() > tokenExpiry) {
		showOAuthPopup();
		return false;
	}
	const token = PersistentStorage.load("spotify_token");
	if (token) {
		accessToken = token;
		return true;
	}
	showOAuthPopup();
	return false;
}

window.onSpotifyWebPlaybackSDKReady = () => {
	if (getAccessToken()) {
		window.onTokenReceived();
	}
};

window.onTokenReceived = () => {
	player = new Spotify.Player({
		name: "Spark EV",
		getOAuthToken: (cb) => {
			cb(accessToken);
		},
		volume: 1,
	});

	player.addListener("ready", ({ device_id }) => {
		//if (!window.isSpotifyLoaded) console.clear();
		window.isSpotifyLoaded = true;
		activeDeviceId = device_id;
	});

	player.addListener("player_state_changed", async (state) => {
		if (state) {
			const song = Song.fromJSON(state.track_window.current_track);
			await updateSongDetails(song, state.position, state.duration);
			if (!state.paused) {
				startProgressBar(state.position, state.duration);
			} else {
				stopProgressBar();
			}
			if (
				state.position === 0 &&
				!state.paused &&
				state.track_window.previous_tracks.length > 0
			) {
				// Track ended, play the next one
				await playNext();
			}
		}
	});

	player.connect();
};

async function fetchWebApi(endpoint, method, body) {
	if (!getAccessToken()) return;
	const res = await fetch(`https://api.spotify.com/${endpoint}`, {
		headers: {
			Authorization: `Bearer ${accessToken}`,
			"Content-Type": "application/json",
		},
		method,
		body: body ? JSON.stringify(body) : null,
	});

	try {
		const json = await res.json();
		return json;
	} catch (e) {
		if (res.status === 204) return;
		console.error(e);
	}
}

async function getTopTracks() {
	const data = await fetchWebApi(
		"v1/me/top/tracks?time_range=long_term&limit=5",
		"GET"
	);
	return data ? data.items : [];
}

function queueTrack(track) {
	playlist.add(Song.fromJSON(track));
}

function queuePlaylist(playlistId) {
	fetchWebApi(`v1/playlists/${playlistId}/tracks`, "GET").then((data) => {
		data.items.forEach((item) => {
			queueTrack(item.track);
		});
	});
}

function clearQueue() {
	playlist.clear();
}

async function play() {
	if (playlist.isEmpty() || isPlaying) return;
	isPlaying = true; // Set the flag to true when starting playback
	let track = playlist.pop();
	let ppButton = document.getElementById("play-pause-playback");
	ppButton.classList.replace("fa-play", "fa-pause");

	await fetchWebApi(`v1/me/player/play?device_id=${activeDeviceId}`, "PUT", {
		uris: [track.getUri()],
	});

	isPlaying = false; // Reset the flag after playback starts
}

async function playPrevious() {
	let lastSong = playlist.getPrevious();
	if (lastSong) {
		let ppButton = document.getElementById("play-pause-playback");
		ppButton.classList.replace("fa-play", "fa-pause");

		await fetchWebApi(
			`v1/me/player/play?device_id=${activeDeviceId}`,
			"PUT",
			{
				uris: [lastSong.getUri()],
			}
		);
	}
}

async function playNext() {
	play();
}

function pausePlayback() {
	let ppButton = document.getElementById("play-pause-playback");
	ppButton.classList.replace("fa-pause", "fa-play");
	stopProgressBar();
	return fetchWebApi("v1/me/player/pause", "PUT");
}

function resumePlayback() {
	let ppButton = document.getElementById("play-pause-playback");
	ppButton.classList.replace("fa-play", "fa-pause");
	return fetchWebApi("v1/me/player/play", "PUT");
}

async function togglePlayback() {
	if (await isCurrentlyPlaying()) {
		return pausePlayback();
	} else {
		return resumePlayback();
	}
}

async function getCurrentlyPlaying() {
	const details = await fetchWebApi("v1/me/player/currently-playing", "GET");
	if (!details) return null;
	return Song.fromJSON(details.item);
}

async function isCurrentlyPlaying() {
	const details = await fetchWebApi("v1/me/player/currently-playing", "GET");
	return details ? details.is_playing : false;
}

async function updateSongDetails(song, position, duration) {
	document.getElementById("song-title").innerText = song.getName();
	let artists = song.getArtists();
	const maxLen = 26;
	if (artists.length > maxLen) artists = artists.slice(0, maxLen - 3) + "...";
	document.getElementById("song-artists").innerText = artists;
	document.getElementById("album-cover").src = song.getIcon();
	const progressBar = document.getElementById("playback-progress");
	const progressPercentage = (position / duration) * 100;
	progressBar.style.width = `${progressPercentage}%`;
}

function startProgressBar(currentPosition, duration) {
	const progressBar = document.getElementById("playback-progress");
	const startTime = Date.now();
	const endTime = startTime + (duration - currentPosition);

	if (window.progressInterval) {
		cancelAnimationFrame(window.progressInterval);
	}

	function updateProgressBar() {
		if (isDragging) return; // Skip updating if dragging

		const now = Date.now();
		const elapsed = now - startTime;
		const progress = ((currentPosition + elapsed) / duration) * 100;

		progressBar.style.width = `${progress}%`;

		if (currentPosition + elapsed >= duration) {
			cancelAnimationFrame(window.progressInterval);
		} else {
			window.progressInterval = requestAnimationFrame(updateProgressBar);
		}
	}

	window.progressInterval = requestAnimationFrame(updateProgressBar);
}

function stopProgressBar() {
	if (window.progressInterval) {
		cancelAnimationFrame(window.progressInterval);
		window.progressInterval = null;
	}
}

let isDragging = false;

function initializePlaybackSlider() {
	const sliderContainer = document.querySelector(
		".playback-slider-container"
	);
	const progressBar = document.getElementById("playback-progress");

	let dragStartX = 0;
	let dragStartWidth = 0;

	sliderContainer.addEventListener("mousedown", async (e) => {
		if (!(player && player._options && player._options.getOAuthToken)) return;
		isDragging = true;
		dragStartX = e.clientX;
		const rect = sliderContainer.getBoundingClientRect();
		dragStartWidth = ((dragStartX - rect.left) / rect.width) * 100;
		progressBar.style.width = `${dragStartWidth}%`;
		if(!progressBar.classList.contains("progress-no-transition"))
		progressBar.addEventListener("transitionend", () => {
			progressBar.classList.add("progress-no-transition");
		});
	});

	document.addEventListener("mousemove", (e) => {
		if (isDragging) {
			const rect = sliderContainer.getBoundingClientRect();
			const offsetX = e.clientX - rect.left;
			const percentage = Math.min(Math.max(offsetX / rect.width, 0), 1);
			progressBar.style.width = `${percentage * 100}%`;
		}
	});

	document.addEventListener("mouseup", async (e) => {
		if (isDragging) {
			if (!(player && player._options && player._options.getOAuthToken)) return;
			const rect = sliderContainer.getBoundingClientRect();
			const offsetX = e.clientX - rect.left;
			const percentage = Math.min(Math.max(offsetX / rect.width, 0), 1);
			progressBar.style.width = `${percentage * 100}%`;
			player._options.getOAuthToken(async (accessToken) => {
				const songDetails = await getCurrentlyPlaying();
				const newPosition = songDetails.duration * percentage;
				await fetchWebApi(
					`v1/me/player/seek?position_ms=${Math.round(newPosition)}`,
					"PUT"
				);
			});
			progressBar.classList.remove("progress-no-transition");
		}
		isDragging = false;
	});
}

// Call the function to initialize the slider
initializePlaybackSlider();