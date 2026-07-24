import AppRouter from './routes/AppRouter';
import { ConfirmDialogProvider } from './components/ui/ConfirmDialog';

function App() {
  return (
    <ConfirmDialogProvider>
      <AppRouter />
    </ConfirmDialogProvider>
  );
}

export default App;

