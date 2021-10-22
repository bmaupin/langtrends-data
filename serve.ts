'use strict';

import { Server } from 'node-static';
import http from 'http';

const file = new Server(__dirname + '/data');

const server = http.createServer((req, res) => {
  file.serve(req, res);
});

server.listen(4000);
