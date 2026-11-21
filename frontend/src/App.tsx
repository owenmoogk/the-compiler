import { Container } from '@mantine/core';
import { Route, Routes } from 'react-router';

import Nav from './components/Nav';
import './main.css';
import { paths } from './Paths';

export default function App() {
  return (
    <>
      <Nav />
      {/* Same 700px column as owenmoogk.com. */}
      <Container size={700} px="md" pb={50} pt={30}>
        <Routes>
          {paths.map((route, index) => (
            <Route key={index} path={route.path} element={route.element}>
              {route.children?.map((child, childIndex) => (
                <Route
                  key={childIndex}
                  path={child.path}
                  element={child.element}
                />
              ))}
            </Route>
          ))}
        </Routes>
      </Container>
    </>
  );
}
