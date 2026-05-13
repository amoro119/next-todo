/* eslint-disable */
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('electron', {});
