'use strict';

import { Server } from 'node-static';
import http from 'http';

const port = 4000;

const file = new Server(__dirname + '/data', {
  headers: {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET',
    'Access-Control-Allow-Headers': 'Content-Type',
  },
});

const server = http.createServer((req, res) => {
  file.serve(req, res);
});

server.listen(port, () => {
  console.log(`Listening at http://localhost:${port}`);
});
