import AppRouter from './routes/AppRouter';
import { ConfirmDialogProvider } from './components/ui/ConfirmDialog';
import { AlertDialogProvider } from './components/ui/AlertDialog';
import UpdateToast from './components/ui/UpdateToast';

function App() {
  return (
    <ConfirmDialogProvider>
      <AlertDialogProvider>
        <AppRouter />
        {/* Detects new deployments and auto-refreshes everyone's tab onto
            the latest version — see useVersionCheck for how it works. */}
        <UpdateToast />
      </AlertDialogProvider>
    </ConfirmDialogProvider>
  );
}

export default App;