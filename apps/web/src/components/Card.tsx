import { Box, type BoxProps } from '@chakra-ui/react';
import type { ReactNode } from 'react';

export function Card({ children, ...props }: BoxProps & { children: ReactNode }) {
  return (
    <Box
      bg="white"
      borderRadius="xl"
      boxShadow="sm"
      borderWidth="1px"
      borderColor="gray.100"
      p={{ base: 4, md: 5 }}
      {...props}
    >
      {children}
    </Box>
  );
}
