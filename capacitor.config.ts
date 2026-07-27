import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.workcontrol.app',
  appName: 'WorkControl',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    url: 'http://10.100.2.23:8080',
    cleartext: true
  }
};

export default config;
