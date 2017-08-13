var Service;
var Characteristic;
var request = require("request");
var pollingtoevent = require('polling-to-event');
var wol = require('wake_on_lan');

module.exports = function(homebridge) {
	Service = homebridge.hap.Service;
	Characteristic = homebridge.hap.Characteristic;
	homebridge.registerAccessory("homebridge-philipstv", "PhilipsTV", HttpStatusAccessory);
}

function HttpStatusAccessory(log, config) {
	this.log = log;
	var that = this;

	// CONFIG
	this.ip_address = config["ip_address"];
	this.name = config["name"];
	this.poll_status_interval = config["poll_status_interval"] || "0";
	this.model_year = config["model_year"] || "2014";
	this.wol_url = config["wol_url"] || "";
	this.model_year_nr = parseInt(this.model_year);
	this.set_attempt = 0;

	// CREDENTIALS FOR API
	this.username = config["username"] || "";
	this.password = config["password"] || "";

	// CHOOSING API VERSION BY MODEL/YEAR
	switch (this.model_year_nr) {
		case 2016:
			this.api_version = 6;
			break;
		case 2014:
			this.api_version = 5;
			break;
		default:
			this.api_version = 1;
	}

	// CONNECTION SETTINGS
	this.protocol = (this.api_version > 5) ? "https" : "http";
	this.portno = (this.api_version > 5) ? "1926" : "1925";

	that.log("Model year: " + this.model_year_nr);
	that.log("API version: " + this.api_version);

	this.state = false;
	this.state_ambilight = false;


	// POWER
	this.status_url = this.protocol + "://" + this.ip_address + ":" + this.portno + "/" + this.api_version + "/powerstate";

	this.on_url = this.protocol + "://" + this.ip_address + ":" + this.portno + "/" + this.api_version + "/powerstate";
	this.on_body = JSON.stringify({
		"powerstate": "On"
	});

	this.off_url = this.protocol + "://" + this.ip_address + ":" + this.portno + "/" + this.api_version + "/powerstate";
	this.off_body = JSON.stringify({
		"powerstate": "Standby"
	});

	// AMBILIGHT
	this.status_url_ambilight = this.protocol + "://" + this.ip_address + ":" + this.portno + "/" + this.api_version + "/ambilight/power";

	this.on_url_ambilight = this.protocol + "://" + this.ip_address + ":" + this.portno + "/" + this.api_version + "/ambilight/currentconfiguration";
	this.on_body_ambilight = JSON.stringify({
		"styleName": "FOLLOW_VIDEO",
		"isExpert": false,
		"menuSetting": "NATURAL"
	});

	this.off_url_ambilight = this.status_url_ambilight
	this.off_body_ambilight = JSON.stringify({
		"power": "Off"
	});

	// INFOSET
	this.powerstateOnError = "0";
	this.powerstateOnConnect = "1";
	this.info = {
		serialnumber: "Unknown",
		model: "Unknown",
		manufacterer: "Philips",
		name: "not provided",
		softwareversion: "Unknown"
	};

	// POLLING ENABLED?
	this.interval = parseInt(this.poll_status_interval);
	this.switchHandling = "check";
	if (this.status_url && this.interval > 10 && this.interval < 100000) {
		this.switchHandling = "poll";
	}

	// STATUS POLLING
	if (this.switchHandling == "poll") {
		var powerurl = this.status_url;

		var statusemitter = pollingtoevent(function(done) {
			that.getPowerState(function(error, response) {
				done(error, response, that.set_attempt);
			}, "statuspoll");
		}, {
			longpolling: true,
			interval: that.interval * 1000,
			longpollEventName: "statuspoll"
		});

		statusemitter.on("statuspoll", function(data) {
			that.state = data;
			if (that.switchService) {
				that.switchService.getCharacteristic(Characteristic.On).setValue(that.state, null, "statuspoll");
			}
		});

		var statusemitter_ambilight = pollingtoevent(function(done) {
			that.getAmbilightState(function(error, response) {
				done(error, response, that.set_attempt);
			}, "statuspoll");
		}, {
			longpolling: true,
			interval: that.interval * 1000,
			longpollEventName: "statuspoll_ambilight"
		});

		statusemitter_ambilight.on("statuspoll_ambilight", function(data) {
			that.state_ambilight = data;
			if (that.ambilightService) {
				that.ambilightService.getCharacteristic(Characteristic.On).setValue(that.state_ambilight, null, "statuspoll");
			}
		});
	}
}

HttpStatusAccessory.prototype = {

	httpRequest: function(url, body, method, api_version, callback) {
		var options = {
			url: url,
			body: body,
			method: method,
			rejectUnauthorized: false,
			timeout: 3000
		};

		// EXTRA CONNECTION SETTINGS FOR API V6 (HTTP DIGEST)
		if (api_version == 6) {
			options.followAllRedirects = true;
			options.forever = true;
			options.auth = {
				user: this.username,
				pass: this.password,
				sendImmediately: false
			}
		}

		req = request(options,
			function(error, response, body) {
				callback(error, response, body)
			});
	},

	wolRequest: function(url, callback) {
		if (!url) {
			callback(null, "EMPTY");
			return;
		}
		if (url.substring(0, 3).toUpperCase() == "WOL") {
			//Wake on lan request
			var macAddress = url.replace(/^WOL[:]?[\/]?[\/]?/ig, "");
			this.log("Excuting WakeOnLan request to " + macAddress);
			wol.wake(macAddress, function(error) {
				if (error) {
					callback(error);
				} else {
					callback(null, "OK");
				}
			});
		} else {
			if (url.length > 3) {
				callback(new Error("Unsupported protocol: ", "ERROR"));
			} else {
				callback(null, "EMPTY");
			}
		}
	},

	// POWER FUnCTIONS
	setPowerStateLoop: function(nCount, url, body, powerState, callback) {
		var that = this;

		that.httpRequest(url, body, "POST", this.api_version, function(error, response, responseBody) {
			if (error) {
				if (nCount > 0) {
					that.log('setPowerStateLoop - powerstate attempt, attempt id: ', nCount - 1);
					that.setPowerStateLoop(nCount - 1, url, body, powerState, function(err, state) {
						callback(err, state);
					});
				} else {
					that.log('setPowerStateLoop - failed: %s', error.message);
					powerState = false;
					callback(new Error("HTTP attempt failed"), powerState);
				}
			} else {
				that.log('setPowerStateLoop - Succeeded - current state: %s', powerState);
				callback(null, powerState);
			}
		});
	},

	setPowerState: function(powerState, callback, context) {
		var url;
		var body;
		var that = this;

		//if context is statuspoll, then we need to ensure that we do not set the actual value
		if (context && context == "statuspoll") {
			callback(null, powerState);
			return;
		}
		if (!this.ip_address) {
			this.log.warn("Ignoring request; No ip_address defined.");
			callback(new Error("No ip_address defined."));
			return;
		}

		this.set_attempt = this.set_attempt + 1;

		if (powerState) {
			url = this.on_url;
			body = this.on_body;
			this.log("setPowerState - setting power state to on");

			if (this.model_year_nr <= 2013) {
				this.log("Power On is not possible for model_year before 2014.");
				callback(new Error("Power On is not possible for model_year before 2014."));
				return;
			}
		} else {
			url = this.off_url;
			body = this.off_body;
			this.log("setPowerState - setting power state to off");
		}

		if (this.wol_url && powerState) {
			that.log('setPowerState - WOL request done..');
			this.wolRequest(this.wol_url, function(error, response) {
				that.log('setPowerState - WOL callback response: %s', response);
				that.log('setPowerState - powerstate attempt, attempt id: ', 8);
				//execute the callback immediately, to give control back to homekit
				callback(error, that.state);
				that.setPowerStateLoop(8, url, body, powerState, function(error, state) {
					that.state = state;
					if (error) {
						that.state = false;
						that.log("setPowerStateLoop - ERROR: %s", error);
						if (that.switchService) {
							that.switchService.getCharacteristic(Characteristic.On).setValue(that.state, null, "statuspoll");
						}
					}
				});
			}.bind(this));
		} else {
			that.setPowerStateLoop(0, url, body, powerState, function(error, state) {
				that.state = state;
				if (error) {
					that.state = false;
					that.log("setPowerStateLoop - ERROR: %s", error);
				}
				if (that.switchService) {
					that.switchService.getCharacteristic(Characteristic.On).setValue(that.state, null, "statuspoll");
				}
				if (that.ambilightService) {
					that.state_ambilight = false;
					that.ambilightService.getCharacteristic(Characteristic.On).setValue(that.state_ambilight, null, "statuspoll");
				}
				callback(error, that.state);
			}.bind(this));
		}
	},

	getPowerState: function(callback, context) {
		var that = this;
		//if context is statuspoll, then we need to request the actual value
		if (!context || context != "statuspoll") {
			if (this.switchHandling == "poll") {
				callback(null, this.state);
				return;
			}
		}

		if (!this.status_url) {
			this.log.warn("Ignoring request; No status url defined.");
			callback(new Error("No status url defined."));
			return;
		}

		var url = this.status_url;
		this.httpRequest(url, "", "GET", this.api_version, function(error, response, responseBody) {
			var tResp = that.powerstateOnError;
			var tError = error;
			if (tError) {
				if (that.powerstateOnError) {
					tResp = that.powerstateOnError;
					tError = null;
				}
			} else {
				var parsed = false;
				if (responseBody) {
					var responseBodyParsed = JSON.parse(responseBody);
					if (responseBodyParsed && responseBodyParsed.powerstate) {
						if (responseBodyParsed.powerstate == "On") {
							tResp = "1";
						} else {
							tResp = "0";
						}
						tError = null;
						parsed = true;
					}
				}
				if (!parsed) {
					that.log("getPowerState - Could not parse message: '%s', assume device is ON", responseBody);
					if (that.powerstateOnConnect) {
						tResp = that.powerstateOnConnect;
						tError = null;
					}
				}
			}
			if (tError) {
				that.log('getPowerState - ERROR: %s', error.message);
				var powerState = false;
				that.state = powerState;
				callback(null, powerState);
			} else {
				var binaryState = parseInt(tResp);
				var powerState = binaryState > 0;
				if (that.state != powerState) {
					that.log("getPowerState - statechange to: %s", powerState);
				}
				that.state = powerState;
				callback(null, powerState);
			}
		}.bind(this));
	},

	// AMBILIGHT FUNCTIONS
	setAmbilightStateLoop: function(nCount, url, body, ambilightState, callback) {
		var that = this;

		that.httpRequest(url, body, "POST", this.api_version, function(error, response, responseBody) {
			if (error) {
				if (nCount > 0) {
					that.log('setAmbilightStateLoop - powerstate attempt, attempt id: ', nCount - 1);
					that.setAmbilightStateLoop(nCount - 1, url, body, ambilightState, function(err, state) {
						callback(err, state);
					});
				} else {
					that.log('setAmbilightStateLoop - failed: %s', error.message);
					ambilightState = false;
					callback(new Error("HTTP attempt failed"), ambilightState);
				}
			} else {
				that.log('setAmbilightStateLoop - succeeded - current state: %s', ambilightState);
				callback(null, ambilightState);
			}
		});
	},

	setAmbilightState: function(ambilightState, callback, context) {
		var url;
		var body;
		var that = this;

		//if context is statuspoll, then we need to ensure that we do not set the actual value
		if (context && context == "statuspoll") {
			callback(null, ambilightState);
			return;
		}
		if (!this.ip_address) {
			this.log.warn("Ignoring request; No ip_address defined.");
			callback(new Error("No ip_address defined."));
			return;
		}

		this.set_attempt = this.set_attempt + 1;

		if (ambilightState) {
			url = this.on_url_ambilight;
			body = this.on_body_ambilight;
			this.log("setAmbilightState - setting state to on");
		} else {
			url = this.off_url_ambilight;
			body = this.off_body_ambilight;
			this.log("setAmbilightState - setting state to off");
		}

		that.setAmbilightStateLoop(0, url, body, ambilightState, function(error, state) {
			that.state_ambilight = ambilightState;
			if (error) {
				that.state_ambilight = false;
				that.log("setAmbilightState - ERROR: %s", error);
				if (that.ambilightService) {
					that.ambilightService.getCharacteristic(Characteristic.On).setValue(that.state_ambilight, null, "statuspoll");
				}
			}
			callback(error, that.state_ambilight);
		}.bind(this));
	},

	getAmbilightState: function(callback, context) {
		var that = this;
		//if context is statuspoll, then we need to request the actual value
		if (!context || context != "statuspoll") {
			if (this.switchHandling == "poll") {
				//this.log("getPowerState - polling mode, return state: ", this.state); 
				callback(null, this.state_ambilight);
				return;
			}
		}

		if (!this.status_url_ambilight) {
			this.log.warn("Ignoring request; No ambilight status url defined.");
			callback(new Error("No ambilight status url defined."));
			return;
		}

		var url = this.status_url_ambilight;
		//this.log("getPowerState - actual mode");

		this.httpRequest(url, "", "GET", this.api_version, function(error, response, responseBody) {
			var tResp = that.powerstateOnError;
			var tError = error;
			if (tError) {
				if (that.powerstateOnError) {
					tResp = that.powerstateOnError;
					tError = null;
				}
			} else {
				var parsed = false;
				if (responseBody) {
					var responseBodyParsed = JSON.parse(responseBody);
					if (responseBodyParsed && responseBodyParsed.power) {
						if (responseBodyParsed.power == "On") {
							tResp = "1";
						} else {
							tResp = "0";
						}
						tError = null;
						parsed = true;
					}
				}
				if (!parsed) {
					that.log("Could not parse message2: '%s', assume device is ON", responseBody);
					if (that.powerstateOnConnect) {
						tResp = that.powerstateOnConnect;
						tError = null;
					}
				}
			}
			if (tError) {
				that.log('getAmbilightState - actual mode - failed: %s', error.message);
				var powerState = false;
				that.state_ambilight = powerState;
				callback(null, powerState);
			} else {
				var binaryState = parseInt(tResp);
				var powerState = binaryState > 0;
				if (that.state_ambilight != powerState) {
					that.log('getAmbilightState - statechange to: %s', powerState);
				}

				that.state_ambilight = powerState;
				callback(null, powerState);
			}
		}.bind(this));
	},

	identify: function(callback) {
		this.log("Identify requested!");
		callback(); // success
	},

	getServices: function() {
		var that = this;

		var informationService = new Service.AccessoryInformation();
		informationService
			.setCharacteristic(Characteristic.Name, this.name)
			.setCharacteristic(Characteristic.Manufacturer, 'Philips')
			.setCharacteristic(Characteristic.Model, "Year " + this.model_year);

		// POWER
		this.switchService = new Service.Switch(this.name);
		this.switchService
			.getCharacteristic(Characteristic.On)
			.on('get', this.getPowerState.bind(this))
			.on('set', this.setPowerState.bind(this));

		// AMBILIGHT
		this.ambilightService = new Service.Lightbulb(this.name + " Ambilight");
		this.ambilightService
			.getCharacteristic(Characteristic.On)
			.on('get', this.getAmbilightState.bind(this))
			.on('set', this.setAmbilightState.bind(this));

		return [informationService, this.switchService, this.ambilightService];
	}
};
