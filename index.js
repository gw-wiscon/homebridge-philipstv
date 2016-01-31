var Service;
var Characteristic;
var request = require("request");
var pollingtoevent = require('polling-to-event');
var wol = require('wake_on_lan');

module.exports = function(homebridge)
{
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  homebridge.registerAccessory("homebridge-philipstv", "PhilipsTV", HttpStatusAccessory);
}

function HttpStatusAccessory(log, config) 
{
	this.log = log;
	var that = this;
	
	// config
	this.ip_address	= config["ip_address"];
	this.name = config["name"];
	this.poll_status_interval = config["poll_status_interval"] || "0";
	this.model_year = config["model_year"] || "2014";
	this.wol_url = config["wol_url"] || "";
	this.model_year_nr = parseInt(this.model_year);
	
	this.api_version = 5;
	if (this.model_year_nr < 2014) {
		this.api_version = 1;
	}
	that.log("Model year: "+this.model_year_nr);
	that.log("API version: "+this.api_version);
	
	this.state = false;
	this.interval = parseInt( this.poll_status_interval);
	this.on_url = "http://"+this.ip_address+":1925/"+this.api_version+"/input/key";
	this.on_body = JSON.stringify({"key":"Standby"});
	this.off_url = "http://"+this.ip_address+":1925/"+this.api_version+"/input/key";
	this.off_body = JSON.stringify({"key":"Standby"});
	this.status_url = "http://"+this.ip_address+":1925/"+this.api_version+"/system";
	this.powerstateOnError = "0";
	this.powerstateOnConnect = "1";
	this.info = {
		serialnumber : "Unknown",
		model :"Unknown",
		manufacterer : "Philips",
		name : "not provided",
		softwareversion : "Unknown"
	};
	
	this.switchHandling = "check";
	if (this.status_url && this.interval > 10 && this.interval < 100000) {
		this.switchHandling = "poll";
	}
	
	// Status Polling
	if (this.switchHandling == "poll") {
		var powerurl = this.status_url;
		
		var statusemitter = pollingtoevent(function(done) {
			//that.log("Polling switch level..");
			that.httpRequest(powerurl, "", "GET", function(error, response, responseBody) {
				var tResp = responseBody;
				var tError = error;
				if (tError) {
					if (that.powerstateOnError) {
					  tResp = that.powerstateOnError;
					  tError = null;
					}
				} else {
					if (that.powerstateOnConnect) {
					  tResp = that.powerstateOnConnect;
					  tError = null;
					}
					
					//that.log("Poll resp: "+responseBody);
				}

				if (tError) {
					that.log('HTTP get power function failed: %s', error.message);
					done(error);
				} else {
					done(null, tResp);
				}
			})
		}, {longpolling:true,interval:that.interval * 1000,longpollEventName:"statuspoll"});

		statusemitter.on("statuspoll", function(data) {
			var binaryState = parseInt(data);
			that.state = binaryState > 0;
			that.log("State data changed message received: ", binaryState); 
		});
	}
}

HttpStatusAccessory.prototype = {

httpRequest: function(url, body, method, callback) {
	req = request({
		url: url,
		body: body,
		method: method,
		rejectUnauthorized: false,
		timeout: 3000
	},
	function(error, response, body) {
		callback(error, response, body)
	});
},

wolRequest: function(url, callback) {
	if (!url) {
		callback(null, "EMPTY");
		return;
	}
	if (url.substring( 0, 3).toUpperCase() == "WOL") {
		//Wake on lan request
		var macAddress = url.replace(/^WOL[:]?[\/]?[\/]?/ig,"");
		this.log("Excuting WakeOnLan request to "+macAddress);
		wol.wake(macAddress, function(error) {
		  if (error) {
			callback( error);
		  } else {
			callback( null, "OK");
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

setPowerState: function(powerOn, callback) {
    var url;
    var body;
	var that = this;

    if (!this.ip_address) {
    	    this.log.warn("Ignoring request; No ip_address defined.");
	    callback(new Error("No ip_address defined."));
	    return;
    }

    if (powerOn) {
    		macAddress = "xx:xx:xx:xx:xx:xx";
    		wol.wake(macAddress,function(error){});
    		// here would a pause of 3 seconds, i don't know how make it
    		
    		//////////////////////////
		url = this.on_url;
		body = this.on_body;
		this.log("Setting power state to on");
		
		if (this.model_year_nr < 2013) {
			this.log("Power On is not possible via ethernet for model_year before 2014.");
			callback(new Error("Power On is not possible via ethernet for model_year before 2014."));
			return;
		}
    } else {
		url = this.off_url;
		body = this.off_body;
		this.log("Setting power state to off");
    }

	if (this.wol_url && powerOn) {
		this.wolRequest(this.wol_url, function(error, response) {
			that.log('WOL callback response: %s', response);
			this.httpRequest(url, body, "POST", function(error, response, responseBody) {
				if (error) {
					that.log('HTTP set power function failed: %s', error.message);
					var powerOn = false;
					that.log("Power state is currently %s", powerOn);
					that.state = powerOn;
					
					callback(null, powerOn);
				} else {
					that.log('HTTP set power function succeeded!');
					callback();
				}
			});
		}.bind(this));
	} else {
		this.httpRequest(url, body, "POST", function(error, response, responseBody) {
			if (error) {
				that.log('HTTP set power function failed: %s', error.message);
				var powerOn = false;
				that.log("Power state is currently %s", powerOn);
				that.state = powerOn;
				
				callback(null, powerOn);
			} else {
				that.log('HTTP set power function succeeded!');
				callback();
			}
		}.bind(this));
	}
},
  
getPowerState: function(callback) {
	if (this.switchHandling == "poll") {
		this.log("getPowerState - polling mode, return state: ", this.state); 
		callback(null, this.state);
		return;
	}
	
    if (!this.status_url) {
    	this.log.warn("Ignoring request; No status url defined.");
	    callback(new Error("No status url defined."));
	    return;
    }
    
    var url = this.status_url;
	this.log("Getting power state");
	var that = this;

    this.httpRequest(url, "", "GET", function(error, response, responseBody) {
		var tResp = responseBody;
		var tError = error;
		if (tError) {
			if (that.powerstateOnError) {
			  tResp = that.powerstateOnError;
			  tError = null;
			}
		} else {
			if (that.powerstateOnConnect) {
			  tResp = that.powerstateOnConnect;
			  tError = null;
			}
			//that.log("get resp: "+ responseBody);
		}
		if (tError) {
			that.log('HTTP get power function failed: %s', error.message);
			var powerOn = false;
			that.log("Power state is currently %s", powerOn);
			that.state = powerOn;
			callback(null, powerOn);
		} else {
			var binaryState = parseInt(tResp);
			var powerOn = binaryState > 0;
			that.log("Power state is currently %s", powerOn);
			that.state = powerOn;
			callback(null, powerOn);
		}
	}.bind(this));
},

identify: function(callback) {
    this.log("Identify requested!");
    callback(); // success
},

processInformation: function( info, informationService, firstTime)
{
	if (!info)
		return;
		
	var equal = true;
	
	var deviceManufacturer = info.manufacturer || "Philips";
	if (deviceManufacturer != this.info.manufacturer) {
		equal = false;
		this.info.manufacturer = deviceManufacturer;
	}
	
	var deviceModel = info.model || "Not provided";
	if (deviceModel == "Not provided" && info.model_encrypted) {
		deviceModel = "encrypted";
	}
	if (deviceModel != this.info.model) {
		equal = false;
		this.info.model = deviceModel;
	}
	
	var deviceSerialnumber = info.serialnumber || "Not provided";
	if (deviceSerialnumber == "Not provided" && info.serialnumber_encrypted) {
		deviceSerialnumber = "encrypted";
	}
	if (deviceSerialnumber != this.info.serialnumber) {
		equal = false;
		this.info.serialnumber = deviceSerialnumber;
	}
	
	var deviceName = info.name || "Not provided";
	if (deviceName != this.info.name) {
		equal = false;
		this.info.name = deviceName;
	}
	
	var deviceSoftwareversion = info.softwareversion || "Not provided";
	if (deviceSoftwareversion == "Not provided" && info.softwareversion_encrypted) {
		deviceSoftwareversion = "encrypted";
	}	
	if (deviceSoftwareversion != this.info.softwareversion) {
		equal = false;
		this.info.softwareversion = deviceSoftwareversion;
	}
	
	if( !equal || firstTime) {
		if (informationService) {
			this.log('Setting info: '+ JSON.stringify( this.info));
			informationService
			.setCharacteristic(Characteristic.Manufacturer, deviceManufacturer)
			.setCharacteristic(Characteristic.Model, deviceModel)
			.setCharacteristic(Characteristic.SerialNumber, deviceSerialnumber);
		}
	}
},

getServices: function() {
	var that = this;

	var informationService = new Service.AccessoryInformation();
	this.processInformation( this.info, informationService, true);

	this.switchService = new Service.Switch(this.name);

	this.switchService
		.getCharacteristic(Characteristic.On)
		.on('get', this.getPowerState.bind(this))
		.on('set', this.setPowerState.bind(this));

	return [informationService, this.switchService];
}
};
