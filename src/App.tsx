import AppRouter from './routes/AppRouter';
import { ConfirmDialogProvider } from './components/ui/ConfirmDialog';
import { AlertDialogProvider } from './components/ui/AlertDialog';
import { ToastProvider } from './components/ui/ToastProvider';
import UpdateToast from './components/ui/UpdateToast';

function App() {
  return (
    <ConfirmDialogProvider>
      <AlertDialogProvider>
        <ToastProvider>
          <AppRouter />
          {/* Detects new deployments and shows a banner the admin/user can
              refresh from when ready — see UpdateToast for why it never
              reloads on its own. */}
          <UpdateToast />
        </ToastProvider>
      </AlertDialogProvider>
    </ConfirmDialogProvider>
  );
}

export default App;