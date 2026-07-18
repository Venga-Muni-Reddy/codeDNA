import { useAppStore } from './store/useAppStore';
import { Auth } from './pages/Auth';
import { Dashboard } from './pages/Dashboard';

function App() {
  const token = useAppStore((state) => state.accessToken);

  return token ? <Dashboard /> : <Auth />;
}

export default App;
export { App };
