// Initialize Chart
const ctx = document.getElementById("rttChart").getContext("2d");
const rttChart = new Chart(ctx, {
    type: "line",
    data: {
        labels: [],
        datasets: [{
            label: "RTT (ms)",
            data: [],
            borderColor: getComputedStyle(document.documentElement)
                .getPropertyValue('--primary-color'),
            backgroundColor: 'rgba(33, 150, 243, 0.1)',
            fill: true,
            tension: 0.4
        }]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'top',
            },
            title: {
                display: true,
                text: 'Round Trip Time Variation'
            }
        },
        scales: {
            x: {
                title: {
                    display: true,
                    text: "Packet Number"
                },
                grid: {
                    display: false
                }
            },
            y: {
                title: {
                    display: true,
                    text: "RTT (ms)"
                },
                beginAtZero: true
            }
        }
    }
});

// Chart update function
function updateChart(rttValues) {
    rttChart.data.labels = rttValues.map((_, i) => i + 1);
    rttChart.data.datasets[0].data = rttValues;
    rttChart.update();
}

// Reset function
function resetFields() {
    document.getElementById("target").value = '';
    document.getElementById("output").value = '';
    document.getElementById("geoOutput").value = '';
    rttChart.data.labels = [];
    rttChart.data.datasets[0].data = [];
    rttChart.update();
    document.getElementById("status").innerText = "Status: Ready";
    document.querySelector('.container').classList.remove('loading');
}

// Network Layer Simulation
const layerInfo = {
    application: {
        name: "Application Layer (Layer 7)",
        protocols: "HTTP, FTP, SMTP, DNS",
        description: "Provides network services directly to end-users or applications",
        examples: "Web browsers, email clients, file transfers"
    },
    transport: {
        name: "Transport Layer (Layer 4)",
        protocols: "TCP, UDP",
        description: "Ensures reliable data delivery between applications",
        examples: "TCP connection handling, UDP datagram transmission"
    },
    network: {
        name: "Network Layer (Layer 3)",
        protocols: "IP, ICMP, IGMP",
        description: "Handles packet routing and IP addressing",
        examples: "IP routing, packet forwarding"
    },
    datalink: {
        name: "Data Link Layer (Layer 2)",
        protocols: "Ethernet, WiFi",
        description: "Handles direct node-to-node data delivery",
        examples: "MAC addressing, frame transmission"
    },
    physical: {
        name: "Physical Layer (Layer 1)",
        protocols: "Ethernet cables, Fiber optics",
        description: "Transmits raw bits over physical medium",
        examples: "Bit transmission, signal processing"
    }
};

function updateLayerInfo(layerId) {
    const info = layerInfo[layerId];
    const detailsHtml = `
        <strong>${info.name}</strong><br>
        <strong>Protocols:</strong> ${info.protocols}<br>
        <strong>Description:</strong> ${info.description}<br>
        <strong>Examples:</strong> ${info.examples}
    `;
    document.getElementById('layerDetails').innerHTML = detailsHtml;
}

function simulatePacketTravel(isRequest = true) {
    const layers = ['application', 'transport', 'network', 'datalink', 'physical'];
    const packets = document.querySelectorAll('.packet');
    
    // Reset all packets
    packets.forEach(packet => {
        packet.classList.remove('active', 'moving-down', 'moving-up');
    });

    if (isRequest) {
        // Simulate request (going down the layers)
        let delay = 0;
        layers.forEach((layer, index) => {
            setTimeout(() => {
                document.querySelectorAll('.layer').forEach(l => l.classList.remove('active-layer'));
                document.getElementById(layer).classList.add('active-layer');
                updateLayerInfo(layer);
                const packet = document.querySelector(`#${layer} .packet`);
                packet.classList.add('active');
                if (index < layers.length - 1) {
                    packet.classList.add('moving-down');
                }
            }, delay);
            delay += 1000;
        });

        // Simulate response (going up the layers) after a delay
        setTimeout(() => simulatePacketTravel(false), delay + 1000);
    } else {
        // Simulate response (going up the layers)
        let delay = 0;
        [...layers].reverse().forEach((layer, index) => {
            setTimeout(() => {
                document.querySelectorAll('.layer').forEach(l => l.classList.remove('active-layer'));
                document.getElementById(layer).classList.add('active-layer');
                updateLayerInfo(layer);
                const packet = document.querySelector(`#${layer} .packet`);
                packet.classList.add('active');
                if (index < layers.length - 1) {
                    packet.classList.add('moving-up');
                }
            }, delay);
            delay += 1000;
        });
    }
}

// Add click handlers for layers
document.querySelectorAll('.layer').forEach(layer => {
    layer.addEventListener('click', () => {
        document.querySelectorAll('.layer').forEach(l => l.classList.remove('active-layer'));
        layer.classList.add('active-layer');
        updateLayerInfo(layer.id);
    });
});

// Main data fetching function
async function fetchData(endpoint) {
    simulatePacketTravel(true);
    const target = document.getElementById("target").value.trim();
    if (!target) {
        alert("Please enter a valid IP or hostname.");
        return;
    }

    const statusEl = document.getElementById("status");
    statusEl.innerText = `Status: Running ${endpoint}...`;
    document.querySelector('.container').classList.add('loading');

    try {
        const res = await fetch(`http://localhost:5000/${endpoint}?target=${target}`);
        if (!res.ok) {
            const errorData = await res.json();
            throw new Error(errorData.error || `HTTP error! status: ${res.status}`);
        }
        const data = await res.json();
        
        // Update output area
        document.getElementById("output").value = data.output || 'No output received';
        
        // Update chart if it's a ping response
        if (endpoint === 'ping' && data.rttValues && data.rttValues.length > 0) {
            updateChart(data.rttValues);
        } else if (endpoint === 'ping') {
            // Clear chart for ping with no RTT values
            rttChart.data.labels = [];
            rttChart.data.datasets[0].data = [];
            rttChart.update();
        }
        
        // Update geolocation data
        if (data.geoData && data.geoData.length > 0) {
            const geoText = data.geoData.map(info => 
                `IP: ${info.ip}\nLocation: ${info.location}\nISP: ${info.isp}\n`
            ).join("\n");
            document.getElementById("geoOutput").value = geoText;
        } else {
            document.getElementById("geoOutput").value = "No geolocation data available.";
        }
    } catch (err) {
        console.error("Error:", err);
        document.getElementById("output").value = 
            "Error occurred while fetching data. Please check if:\n" +
            "1. The backend server is running\n" +
            "2. You have a working internet connection\n" +
            "3. The target host is reachable\n\n" +
            "Error details: " + err.message;
        
        document.getElementById("geoOutput").value = "Error occurred while fetching geolocation data.";
        
        // Clear chart on error
        if (endpoint === 'ping') {
            rttChart.data.labels = [];
            rttChart.data.datasets[0].data = [];
            rttChart.update();
        }
    } finally {
        statusEl.innerText = "Status: Ready";
        document.querySelector('.container').classList.remove('loading');
    }
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    // Button click handlers
    document.getElementById('pingBtn').addEventListener('click', () => fetchData('ping'));
    document.getElementById('tracerouteBtn').addEventListener('click', () => fetchData('traceroute'));
    document.getElementById('resetBtn').addEventListener('click', resetFields);

    // Add enter key support for the input field
    document.getElementById('target').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            fetchData('ping');
        }
    });
});