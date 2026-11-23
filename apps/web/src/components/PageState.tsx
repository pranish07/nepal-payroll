import { Alert, AlertDescription, AlertIcon, AlertTitle, Box, Spinner, Text } from '@chakra-ui/react';
import type { ReactNode } from 'react';

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <Box py={16} textAlign="center">
      <Spinner color="brand.500" size="lg" />
      <Text mt={3} color="gray.600">
        {label}
      </Text>
    </Box>
  );
}

export function ErrorState({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : 'Something went wrong.';
  return (
    <Alert status="error" borderRadius="md" my={6}>
      <AlertIcon />
      <Box>
        <AlertTitle>Could not load this view</AlertTitle>
        <AlertDescription>{message}</AlertDescription>
      </Box>
    </Alert>
  );
}

export function QueryState({
  isLoading,
  error,
  children,
  label,
}: {
  isLoading: boolean;
  error: unknown;
  children: ReactNode;
  label?: string;
}) {
  if (isLoading) return <LoadingState label={label} />;
  if (error) return <ErrorState error={error} />;
  return <>{children}</>;
}

export function DraftBanner() {
  return (
    <Alert status="warning" borderRadius="md" mb={4}>
      <AlertIcon />
      <AlertDescription>
        This payroll run is a <strong>draft</strong>. Figures recalculate on demand and can change
        until an admin finalizes it.
      </AlertDescription>
    </Alert>
  );
}
