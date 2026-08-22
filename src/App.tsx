import AppRouter from './routes/AppRouter';
import { ConfirmDialogProvider } from './components/ui/ConfirmDialog';
import { AlertDialogProvider } from './components/ui/AlertDialog';
import UpdateToast from './components/ui/UpdateToast';

function App() {
  return (
    <ConfirmDialogProvider>
      <AlertDialogProvider>
        <AppRouter />
        {/* Detects new deployments and shows a banner the admin/user can
            refresh from when ready — see UpdateToast for why it never
            reloads on its own. */}
        <UpdateToast />
      </AlertDialogProvider>
    </ConfirmDialogProvider>
  );
}

export default App;