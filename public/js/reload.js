/**
 * RoIron Website — Auto-reload after first load
 * Обновляет страницу 1 раз после загрузки для применения всех стилей
 */

(function() {
  // Проверяем, был ли уже релоад
  if (sessionStorage.getItem('roiron_reloaded') === 'true') {
    return;
  }
  
  console.log('[RoIron] First load detected, reloading in 500ms...');
  
  // Устанавливаем флаг и перезагружаем через 500ms
  sessionStorage.setItem('roiron_reloaded', 'true');
  
  setTimeout(function() {
    console.log('[RoIron] Reloading page...');
    window.location.reload();
  }, 500);
})();
