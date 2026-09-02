/**
 * Configuration de production / build par défaut.
 *
 * `apiBaseUrl` doit être une URL ABSOLUE et joignable depuis l'appareil qui
 * exécute l'application. Une application Capacitor n'est pas servie par le
 * serveur de développement : sur un téléphone, « localhost » désigne le
 * téléphone lui-même, pas le PC. Pour tester sur un appareil physique, mettre
 * ici l'adresse LAN de la machine (`ipconfig` → carte Wi-Fi), par exemple
 * `http://192.168.1.24:3000/api`.
 */
export const environment = {
  production: true,
  apiBaseUrl: 'http://localhost:3000/api',
};
