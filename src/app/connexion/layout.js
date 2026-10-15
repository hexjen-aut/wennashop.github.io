// Page privée ou de compte : accessible, mais pas dans les résultats de recherche
// (Google suit quand même ses liens). Même liste que robots.txt, plus /connexion.
export const metadata = {
  robots: { index: false, follow: true },
};

export default function NoIndexLayout({ children }) {
  return children;
}
