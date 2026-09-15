'use strict';

const net = require('net');

const client = net.createConnection({ host: '127.0.0.1', port: 6379 }, () => {
    console.log('Connected to Redis server for demo seeding...');

    const commands = [
        ['AUTH', 'testpassword123'],
        ['SELECT', '0'],

        ['SET', 'user:1001:name', 'Ashutosh Yadav'],
        ['SET', 'user:1001:email', 'ashutosh4tech@gmail.com'],
        ['SET', 'app:environment', 'production'],
        ['SET', 'app:version', 'v2.4.0'],
        ['SET', 'counter:pageviews:homepage', '142857'],
        ['SET', 'session:oauth:token_8f3a', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMDAxIn0'],
        ['EXPIRE', 'session:oauth:token_8f3a', '3600'],
        ['DEL', 'cache:weather:san_francisco'],
        ['SET', 'cache:weather:india', '{"temp": 30, "unit": "C", "condition": "Sunny", "humidity": 55, "location": "India"}'],
        ['EXPIRE', 'cache:weather:india', '1800'],

        ['HSET', 'user:1001:profile', 'name', 'Ashutosh Yadav', 'role', 'Administrator', 'team', 'Platform Core', 'location', 'India', 'status', 'Active'],
        ['HSET', 'server:health:node-01', 'hostname', 'ip-10-0-4-12', 'cpu_usage', '14.2%', 'memory_mb', '512', 'status', 'HEALTHY', 'region', 'us-east-1'],
        ['HSET', 'product:sku:99401', 'title', 'Cloud Database Accelerator', 'category', 'Developer Tools', 'price', '$49.99', 'in_stock', '250'],

        ['DEL', 'queue:task_worker:jobs'],
        ['RPUSH', 'queue:task_worker:jobs', 'job_1042: email_digest', 'job_1043: backup_snapshot', 'job_1044: analytics_rollup', 'job_1045: cache_warmup'],
        ['DEL', 'logs:access:recent'],
        ['RPUSH', 'logs:access:recent', 'GET /api/v1/health 200', 'POST /api/v1/keys 201', 'GET /api/v1/stats 200', 'GET /api/v1/audit 200'],

        ['SADD', 'users:online:active', 'alex_m', 'sarah_k', 'david_chen', 'elena_r', 'jordan_t'],
        ['SADD', 'feature_flags:beta_testers', 'user:1001', 'user:1042', 'user:2088', 'user:3011'],
        ['SADD', 'categories:store_catalog', 'electronics', 'cloud', 'security', 'databases', 'networking'],

        ['ZADD', 'leaderboard:global_rankings', '9850', 'alex_m', '9420', 'sarah_k', '8900', 'david_chen', '8750', 'elena_r', '8200', 'jordan_t'],
        ['ZADD', 'metrics:latency:p99', '4.2', 'us-east', '12.8', 'eu-west', '24.1', 'ap-south', '38.5', 'sa-east'],

        ['SELECT', '1'],
        ['HSET', 'tenant:alpha:config', 'name', 'Alpha Enterprise', 'tier', 'Platinum', 'sla', '99.99%'],
        ['SET', 'tenant:alpha:session', 'session_active_tenant_token_9918'],
        ['EXPIRE', 'tenant:alpha:session', '7200'],

        ['SELECT', '0']
    ];

    function sendResp(cmdArray) {
        let resp = `*${cmdArray.length}\r\n`;
        for (const item of cmdArray) {
            const str = String(item);
            resp += `$${Buffer.byteLength(str)}\r\n${str}\r\n`;
        }
        return resp;
    }

    let payload = '';
    for (const cmd of commands) {
        payload += sendResp(cmd);
    }

    client.write(payload);
});

let responseData = '';
let finished = false;
let doneTimer = null;
client.on('data', (chunk) => {
    responseData += chunk.toString('utf8');
    if (doneTimer) clearTimeout(doneTimer);
    doneTimer = setTimeout(() => {
        if (!finished) {
            finished = true;
            console.log('Demo keys created successfully!');
            client.end();
        }
    }, 150);
});

client.on('error', (err) => {
    console.error('Connection error:', err.message);
    process.exit(1);
});
