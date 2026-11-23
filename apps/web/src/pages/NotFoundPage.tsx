import { Box, Button, Heading, Text } from '@chakra-ui/react';
import { Link as RouterLink } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <Box textAlign="center" py={20}>
      <Heading size="xl" mb={3}>
        Page not found
      </Heading>
      <Text color="gray.600" mb={6}>
        That screen does not exist in this demo payroll app.
      </Text>
      <Button as={RouterLink} to="/" colorScheme="brand">
        Back to payroll periods
      </Button>
    </Box>
  );
}
