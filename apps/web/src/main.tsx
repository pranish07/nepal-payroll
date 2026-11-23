import { ChakraProvider, extendTheme } from '@chakra-ui/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { RoleProvider } from './lib/role';

const theme = extendTheme({
  fonts: {
    heading: 'Georgia, "Times New Roman", serif',
    body: '"Segoe UI", system-ui, -apple-system, sans-serif',
  },
  colors: {
    brand: {
      50: '#eef8f6',
      100: '#d3ece7',
      500: '#1f7a6b',
      600: '#17675a',
      700: '#115349',
    },
  },
  styles: {
    global: {
      'html, body, #root': { minHeight: '100%' },
      body: { bg: 'gray.50' },
    },
  },
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 5_000,
    },
  },
});

const container = document.getElementById('root');
if (!container) throw new Error('Root element was not found.');

createRoot(container).render(
  <StrictMode>
    <ChakraProvider theme={theme}>
      <QueryClientProvider client={queryClient}>
        <RoleProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </RoleProvider>
      </QueryClientProvider>
    </ChakraProvider>
  </StrictMode>,
);
