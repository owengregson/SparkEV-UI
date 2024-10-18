class PersistentStorage {
	static save(key, value) {
		localStorage.setItem("SparkEV." + key, JSON.stringify(value));
	}
	static load(key) {
		return JSON.parse(localStorage.getItem("SparkEV." + key));
	}
	static remove(key) {
		localStorage.removeItem("SparkEV." + key);
	}
	static clear() {
		localStorage.clear();
	}
	static get() {
		for (let i = 0; i < localStorage.length; i++) {
			let key = localStorage.key(i);
			console.log(key.replace("SparkEV.", "") + ": " + localStorage.getItem(key));
		}
	}
}