import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Icon } from '../components/ui';
import '../styles/tokens.css';
import '../styles/components.css';
import './collage.css';

const params = new URLSearchParams(location.search);
const path = params.get('path') ?? '/accountants/1';
document.documentElement.dataset.theme = params.get('theme') === 'dark' ? 'dark' : 'light';

function Collage() {
  const [loaded, setLoaded] = useState(0);
  const onLoad = () => setLoaded((n) => n + 1);

  useEffect(() => {
    if (loaded === 2) document.body.dataset.ready = 'true';
  }, [loaded]);

  return (
    <div className="collage">
      <div className="collage-desktop">
        <div className="collage-bar">
          <span className="collage-dots">
            <i />
            <i />
            <i />
          </span>
          <span className="collage-url">
            <Icon name="certificate" />
            spvdirect.ro{path}
          </span>
        </div>
        <img className="collage-shot-desktop" src={params.get('desktop') ?? ''} alt="" onLoad={onLoad} />
      </div>
      <div className="collage-phone">
        <img className="collage-shot-phone" src={params.get('phone') ?? ''} alt="" onLoad={onLoad} />
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Collage />);
