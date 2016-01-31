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

# Installation

1. Install homebridge using: npm install -g homebridge
2. Install this plugin using: npm install -g homebridge-philipstv
3. Update your configuration file. See the sample below.

# Configuration

Example accessory config for models before 2014 (needs to be added to the homebridge config.json):
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

Example accessory config for models from 2014 onwards (needs to be added to the homebridge config.json):
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
