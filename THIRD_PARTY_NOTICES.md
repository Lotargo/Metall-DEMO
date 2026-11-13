# Third-party components

Metall DEMO reuses the Metall frontend and CAD-Metall viewer at the source revision recorded in `public/demo/manifest.json`.

The application uses React, React Router, TanStack Query, Vite, Tailwind CSS, Lucide, openapi-fetch, Mock Service Worker and Three.js. Their versions and transitive dependencies are fixed in `package-lock.json`; their package distributions retain their respective license notices.

The static 3D viewer distributes Three.js under the MIT license. Its license is included at `public/licenses/three.txt` and in the built website.

Inter is distributed under the SIL Open Font License. The included font license is at `public/licenses/inter.txt`.
