import { Box, Heading, Text, type BoxProps } from '@chakra-ui/react';
import type { ReactNode } from 'react';

export function PageHeader({
  title,
  description,
  actions,
  ...props
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
} & BoxProps) {
  return (
    <Box mb={6} {...props}>
      <Box
        display="flex"
        flexDirection={{ base: 'column', md: 'row' }}
        alignItems={{ base: 'flex-start', md: 'flex-end' }}
        justifyContent="space-between"
        gap={3}
      >
        <Box>
          <Heading size={{ base: 'md', md: 'lg' }} letterSpacing="tight">
            {title}
          </Heading>
          {description && (
            <Text color="gray.600" mt={1} fontSize={{ base: 'sm', md: 'md' }}>
              {description}
            </Text>
          )}
        </Box>
        {actions && <Box>{actions}</Box>}
      </Box>
    </Box>
  );
}
