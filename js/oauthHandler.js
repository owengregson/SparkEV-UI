document.addEventListener("DOMContentLoaded", () => {
	PersistentStorage.remove("spotify_token");
	PersistentStorage.remove("spotify_token_created");
	const token = window.location.hash.split("=")[1].split("&")[0];
	if (token) {
		PersistentStorage.save("spotify_token", token);
		PersistentStorage.save("spotify_token_created", Date.now());
		window.close();
	}
});