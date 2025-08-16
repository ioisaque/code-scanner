// Ação de instalação: apenas para confirmar que o Service Worker está pronto
self.addEventListener('install', (event) => {
  console.log('Service Worker instalado.');
});

// Ação de ativação: limpa caches antigos, se necessário
self.addEventListener('activate', (event) => {
  console.log('Service Worker ativado.');
});

// Ação de notificação
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  // Você pode adicionar uma ação aqui, como abrir a página quando o usuário clicar na notificação
  // event.waitUntil(clients.openWindow('https://sua-pagina.com'));
});