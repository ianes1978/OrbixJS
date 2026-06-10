import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  server: {
    watch: {
      // /mnt/* (WSL drvfs) non supporta inotify: senza polling l'HMR non vede le modifiche
      usePolling: true,
      interval: 300,
    },
  },
});
