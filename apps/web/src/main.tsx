import { ChakraProvider, extendTheme } from '@chakra-ui/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { RoleProvider } from './lib/role';

const theme = extendTheme({
  breakpoints: {
    sm: '480px',
    md: '768px',
    lg: '1024px',
    xl: '1280px',
    '2xl': '1536px',
  },
  fonts: {
    heading: '"Inter", "Segoe UI", system-ui, -apple-system, sans-serif',
    body: '"Inter", "Segoe UI", system-ui, -apple-system, sans-serif',
  },
  colors: {
    brand: {
      50: '#eef7f5',
      100: '#d5ece7',
      200: '#b3ddd4',
      300: '#8ac9bc',
      400: '#5fb3a3',
      500: '#3a9a89',
      600: '#2a7f70',
      700: '#1f6559',
      800: '#174e45',
      900: '#0f3731',
    },
  },
  shadows: {
    card: '0 1px 3px rgba(15, 23, 42, 0.06), 0 1px 2px rgba(15, 23, 42, 0.04)',
    cardHover: '0 4px 12px rgba(15, 23, 42, 0.08)',
  },
  styles: {
    global: {
      'html, body, #root': { minHeight: '100%' },
      body: { bg: 'gray.50', color: 'gray.800' },
      '*::selection': { bg: 'brand.200' },
    },
  },
  components: {
    Button: {
      baseStyle: { borderRadius: 'md', fontWeight: 'semibold' },
      defaultProps: { colorScheme: 'brand' },
    },
    Input: {
      baseStyle: { borderRadius: 'md' },
      defaultProps: { focusBorderColor: 'brand.500' },
    },
    Select: {
      baseStyle: { borderRadius: 'md' },
      defaultProps: { focusBorderColor: 'brand.500' },
    },
    Table: {
      baseStyle: { borderRadius: 'md' },
    },
    Badge: {
      baseStyle: { borderRadius: 'full', px: 2.5, py: 0.5, fontWeight: 'medium' },
    },
    Heading: {
      baseStyle: { letterSpacing: '-0.01em' },
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
