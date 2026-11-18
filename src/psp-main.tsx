import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './PspApp';
import { installPspAndroid } from './lib/psp-android';
installPspAndroid();
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
