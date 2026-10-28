import { Link } from 'react-router-dom';
import { PRODUCT_NAME } from '@settlecraft/shared';
export function Brand() {
  return (
    <Link className="brand" to="/" aria-label={`${PRODUCT_NAME} home`}>
      <span className="brand-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none">
          <path
            d="M5 8h14l-4-4M19 16H5l4 4"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      {PRODUCT_NAME}
    </Link>
  );
}
