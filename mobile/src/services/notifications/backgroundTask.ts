import { notificationsRepository } from '../../database/repositories/notificationsRepository';
import { supportsBackgroundTasks } from './notificationRuntime';
import { checkLineNotices, syncSubscriptions } from './notificationService';

/**
 * Verificação de avisos com o app fechado ou em segundo plano (US17).
 *
 * É "melhor esforço": quem decide quando executar é o sistema operacional (no
 * mínimo a cada ~15 min e só se ele permitir). Não existe no Expo Go nem na
 * web; nesses casos tudo aqui é ignorado em silêncio.
 */
export const LINE_NOTICES_TASK = 'guiamobi-line-notices';

type TaskManagerModule = typeof import('expo-task-manager');
type BackgroundTaskModule = typeof import('expo-background-task');

function load(): { taskManager: TaskManagerModule; backgroundTask: BackgroundTaskModule } | null {
  if (!supportsBackgroundTasks) return null;
  try {
    return {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      taskManager: require('expo-task-manager') as TaskManagerModule,
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      backgroundTask: require('expo-background-task') as BackgroundTaskModule,
    };
  } catch {
    return null;
  }
}

/** Deve ser chamada uma vez, no escopo global do App.tsx (fora de componentes). */
export function defineLineNoticesTask(): void {
  const modules = load();
  if (!modules) return;

  try {
    modules.taskManager.defineTask(LINE_NOTICES_TASK, async () => {
      try {
        await syncSubscriptions();
        await checkLineNotices();
        return modules.backgroundTask.BackgroundTaskResult.Success;
      } catch {
        return modules.backgroundTask.BackgroundTaskResult.Failed;
      }
    });
  } catch {
    // sem tarefa em segundo plano, a verificação continua com o app aberto
  }
}

/** Registra a tarefa enquanto houver notificações ativas com linhas; cancela caso contrário. */
export async function updateBackgroundRegistration(shouldRun: boolean): Promise<void> {
  const modules = load();
  if (!modules) return;

  try {
    const registered = await modules.taskManager.isTaskRegisteredAsync(LINE_NOTICES_TASK);
    if (shouldRun && !registered) {
      const status = await modules.backgroundTask.getStatusAsync();
      if (status === modules.backgroundTask.BackgroundTaskStatus.Available) {
        await modules.backgroundTask.registerTaskAsync(LINE_NOTICES_TASK, { minimumInterval: 15 });
      }
    } else if (!shouldRun && registered) {
      await modules.backgroundTask.unregisterTaskAsync(LINE_NOTICES_TASK);
    }
  } catch {
    // ignorado: é um recurso opcional
  }
}

/** Usado pelo provider para decidir se a tarefa deve existir. */
export async function shouldBackgroundRun(): Promise<boolean> {
  const preferences = await notificationsRepository.getPreferences();
  if (!preferences.enabled) return false;
  return (await notificationsRepository.findAllSubscriptions()).length > 0;
}
