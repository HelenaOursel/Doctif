import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.example.adminassistant',
  appName: "Assistant d'administration",
  webDir: 'dist/admin-assistant/browser',
  server: {
    // L'application est servie en https://localhost sur Android : appeler une
    // API en http:// serait du contenu mixte, donc bloqué. Cette option lève la
    // restriction, le temps du développement sur réseau local. À retirer dès
    // que l'API est servie en HTTPS.
    cleartext: true,
  },
};

export default config;
