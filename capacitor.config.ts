import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.workcontrol.app',
  appName: 'WorkControl',
  webDir: '.output/public',
  server: {
    androidScheme: 'https'
  }
};

export default config;
