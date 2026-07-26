import AppRouter from './routes/AppRouter';
import { ConfirmDialogProvider } from './components/ui/ConfirmDialog';
import { AlertDialogProvider } from './components/ui/AlertDialog';

function App() {
  return (
    <ConfirmDialogProvider>
      <AlertDialogProvider>
        <AppRouter />
      </AlertDialogProvider>
    </ConfirmDialogProvider>
  );
}

export default App;