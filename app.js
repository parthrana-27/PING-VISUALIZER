const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const axios = require('axios');
const os = require('os');

const app = express();
const port = 5000;

app.use(cors());
app.use(express.json());

// Helper function to format ping output
function formatPingOutput(output) {
    const lines = output.split('\n');
    let formattedOutput = '';
    let pingStats = {
        sent: 0,
        received: 0,
        lost: 0,
        minTime: Infinity,
        maxTime: 0,
        avgTime: 0,
        times: []
    };

    lines.forEach(line => {
        if (line.trim()) {
            // For Windows ping output
            if (line.includes('Pinging') || line.includes('Ping statistics')) {
                formattedOutput += `\n${line.trim()}\n${'-'.repeat(80)}\n`;
            } else if (line.includes('Reply from')) {
                const timeMatch = line.match(/time[=<](\d+)ms/);
                if (timeMatch) {
                    const time = parseInt(timeMatch[1]);
                    pingStats.times.push(time);
                    pingStats.minTime = Math.min(pingStats.minTime, time);
                    pingStats.maxTime = Math.max(pingStats.maxTime, time);
                    pingStats.received++;
                }
                formattedOutput += `${line.trim()}\n`;
            } else if (line.includes('packets transmitted')) {
                const match = line.match(/(\d+) packets transmitted, (\d+) received/);
                if (match) {
                    pingStats.sent = parseInt(match[1]);
                    pingStats.received = parseInt(match[2]);
                    pingStats.lost = pingStats.sent - pingStats.received;
                }
                formattedOutput += `${line.trim()}\n`;
            } else {
                formattedOutput += `${line.trim()}\n`;
            }
        }
    });

    // Calculate average time
    if (pingStats.times.length > 0) {
        pingStats.avgTime = pingStats.times.reduce((a, b) => a + b) / pingStats.times.length;
    }

    // Add summary in a nice format
    formattedOutput += '\n' + '='.repeat(80) + '\n';
    formattedOutput += 'PING SUMMARY:\n';
    formattedOutput += '-'.repeat(80) + '\n';
    formattedOutput += `Packets: Sent = ${pingStats.sent}, Received = ${pingStats.received}, Lost = ${pingStats.lost} (${((pingStats.lost/pingStats.sent)*100).toFixed(1)}% loss)\n`;
    if (pingStats.received > 0) {
        formattedOutput += `Round Trip Times: Min = ${pingStats.minTime}ms, Max = ${pingStats.maxTime}ms, Average = ${pingStats.avgTime.toFixed(1)}ms\n`;
    }
    formattedOutput += '='.repeat(80) + '\n';

    return formattedOutput;
}

// Helper function to execute commands with timeout
function executeCommand(command, timeout = 30000) {
    return new Promise((resolve, reject) => {
        console.log('Executing command:', command);
        const process = exec(command, { 
            timeout, 
            maxBuffer: 1024 * 1024,
            windowsHide: true 
        }, (error, stdout, stderr) => {
            if (error) {
                console.error('Command execution error:', error);
                if (error.killed) {
                    reject(new Error('Command timed out'));
                    return;
                }
                if (command.includes('ping')) {
                    reject(error);
                    return;
                }
            }
            resolve(stdout || stderr);
        });

        process.on('error', (error) => {
            console.error('Process error:', error);
            reject(error);
        });
    });
}

// Helper function to get geolocation data
async function getGeolocation(ip) {
    try {
        const response = await axios.get(`http://ip-api.com/json/${ip}`);
        return {
            ip,
            location: `${response.data.city || 'Unknown'}, ${response.data.country || 'Unknown'}`,
            isp: response.data.isp || 'Unknown'
        };
    } catch (error) {
        console.error('Geolocation error for IP', ip, ':', error.message);
        return {
            ip,
            location: 'Location not found',
            isp: 'ISP not found'
        };
    }
}

// Ping endpoint
app.get('/ping', async (req, res) => {
    try {
        const target = req.query.target;
        if (!target) {
            return res.status(400).json({ error: 'Target is required' });
        }

        const isWindows = process.platform === 'win32';
        const pingCommand = isWindows ? 
            `ping -n 4 ${target}` : 
            `ping -c 4 ${target}`;

        console.log('Executing ping command:', pingCommand);
        const output = await executeCommand(pingCommand);
        
        // Format the output
        const formattedOutput = formatPingOutput(output);
        
        // Extract RTT values and IP address
        const rttValues = [];
        let ipAddress = target;
        
        output.split('\n').forEach(line => {
            const timeMatch = line.match(/time[=<](\d+\.?\d*)/i);
            if (timeMatch) {
                rttValues.push(parseFloat(timeMatch[1]));
            }
            
            const ipMatch = line.match(/\[?(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\]?/);
            if (ipMatch) {
                ipAddress = ipMatch[1];
            }
        });

        // Get geolocation data
        const geoData = [await getGeolocation(ipAddress)];

        res.json({
            output: formattedOutput,
            rttValues,
            geoData
        });
    } catch (error) {
        console.error('Ping error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Traceroute endpoint
app.get('/traceroute', async (req, res) => {
    try {
        const target = req.query.target;
        if (!target) {
            return res.status(400).json({ error: 'Target is required' });
        }

        const isWindows = process.platform === 'win32';
        const tracerouteCommand = isWindows ? 
            `tracert -h 30 -w 1000 ${target}` : 
            `traceroute -m 30 -w 1 ${target}`;

        console.log(`Executing traceroute command: ${tracerouteCommand}`);
        
        const output = await executeCommand(tracerouteCommand, 60000);
        
        // Extract IP addresses with improved regex
        const ipAddresses = [];
        const ipRegex = /\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/g;
        let match;
        
        while ((match = ipRegex.exec(output)) !== null) {
            const ip = match[0];
            // Filter out invalid or private IPs
            if (!ipAddresses.includes(ip) && 
                !ip.startsWith('10.') && 
                !ip.startsWith('192.168.') && 
                !ip.startsWith('172.') &&
                ip !== '127.0.0.1' &&
                ip !== '0.0.0.0') {
                ipAddresses.push(ip);
            }
        }

        console.log('Found IP addresses:', ipAddresses);

        // Get geolocation data for each unique IP
        const geoData = await Promise.all(
            ipAddresses.map(async ip => {
                try {
                    return await getGeolocation(ip);
                } catch (error) {
                    console.error(`Failed to get geolocation for IP ${ip}:`, error);
                    return {
                        ip,
                        location: 'Location lookup failed',
                        isp: 'ISP lookup failed'
                    };
                }
            })
        );

        res.json({
            output,
            geoData
        });
    } catch (error) {
        console.error('Traceroute error:', error);
        res.status(500).json({ 
            error: `Traceroute failed: ${error.message}`,
            details: 'Make sure you are running the application with administrator privileges'
        });
    }
});

app.listen(port, () => {
    const isWindows = process.platform === 'win32';
    console.log(`Server running at http://localhost:${port}`);
    console.log(`Running on ${isWindows ? 'Windows' : 'Unix-like'} system`);
    
    if (isWindows) {
        try {
            require('child_process').execSync('net session', { stdio: 'ignore' });
            console.log('Running with administrator privileges');
        } catch (e) {
            console.warn('WARNING: Not running with administrator privileges. Traceroute may not work.');
        }
    }
});
