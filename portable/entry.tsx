import { createRoot } from 'react-dom/client';
import Home from '../app/page';
import '../app/globals.css';

const container = document.getElementById('game');
if (!container) throw new Error('Missing game container');
createRoot(container).render(<Home />);
