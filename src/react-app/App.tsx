import './App.css';
import AdminApp from './AdminApp';
import WorkerApp from './WorkerApp';
export default function App(){return location.pathname.startsWith('/admin')?<AdminApp/>:<WorkerApp/>}
