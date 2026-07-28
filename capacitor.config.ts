import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.workcontrol.app',
  appName: 'WorkControl',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    url: 'https://workfenix.vercel.app',
    cleartext: true
  }
};

export default config;
