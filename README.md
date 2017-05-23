# homebridge-philipstv
Homebridge module for Philips TV (with JointSpace enabled)

# Description

This plugin is basically a modification of homebridge-http.
Main difference is:
- Ability to poll every 5 min a PhilipsTV
- Ability to sent on Standbye command
- If no answer is received, the power state is set to false
- If any answer is received, the power state is set to true

# Update
Added power-on function for models after 2014 (thanks to uronito - https://github.com/uronito )
Added support for 2016 philips models

# Installation

1. Install homebridge using: npm install -g homebridge
2. Install this plugin using: npm install -g homebridge-philipstv
3. Update your configuration file. See the sample below. If you have a 2016 model you have to generate some access-credentials before (see below)

# Configuration

Example accessory config for models **before 2014** (needs to be added to the homebridge config.json):
 ```
"accessories": [
	{
		"accessory": "PhilipsTV",
		"name": "My Philips TV",
		"ip_address": "10.0.1.23",
		"poll_status_interval": "60",
		"model_year" : "2013"
	}
]
 ```

Example accessory config for models **from 2014 and 2015** (needs to be added to the homebridge config.json):
 ```
"accessories": [
	{
		"accessory": "PhilipsTV",
		"name": "My Philips TV",
		"ip_address": "10.0.1.23",
		"poll_status_interval": "60"
	}
]
 ```
 
Example accessory config for models **from 2016** (needs to be added to the homebridge config.json):
  ```
 "accessories": [
 	{
 		"accessory": "PhilipsTV",
 		"name": "My Philips TV",
 		"ip_address": "10.0.1.23",
 		"poll_status_interval": "60",
		"model_year": 2016,
		"username": "deadbeef0815",
		"password": "deadbeef0815deadbeef0815deadbeef0815deadbeef0815deadbeef0815",
 	}
 ]
  ```
 
Added test option for WakeOnWLAN:
 ```
"accessories": [
	{
		"accessory": "PhilipsTV",
		"name": "My Philips TV",
		"ip_address": "10.0.1.23",
		"poll_status_interval": "60",
		"model_year" : "2014",
		"wol_url": "wol://18:8e:d5:a2:8c:66"
	}
]
 ```
 
# Credentials for 2016 models

As of 2016 models Philips closed the open, non-https [JointSpace](http://jointspace.sourceforge.net/) API (v5) and switched to the secured API-version 6. Every control- or status-call needs [digest authentification](https://en.wikipedia.org/wiki/Digest_access_authentication) which contains of a pre generated username and password. You have to do this once for your TV. We reccomend to use the python script [philips\_android\_tv](https://github.com/suborb/philips_android_tv).

Here is an example pairing call for philips\_android\_tv :
```
python ./philips.py --host 10.0.1.23 pair
```

