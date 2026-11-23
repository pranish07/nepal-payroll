import {
  Badge,
  Box,
  Container,
  Flex,
  HStack,
  Heading,
  Link as ChakraLink,
  Select,
  Spacer,
  Text,
} from '@chakra-ui/react';
import { NavLink as RouterNavLink, Outlet } from 'react-router-dom';
import { useRole } from '../lib/role';
import type { Role } from '../lib/types';

const navItems: Array<{ to: string; label: string; adminOnly?: boolean }> = [
  { to: '/', label: 'Payroll periods' },
  { to: '/employees', label: 'Employees' },
  { to: '/policy', label: 'Policy' },
];

function NavItem({ to, label }: { to: string; label: string }) {
  return (
    <ChakraLink
      as={RouterNavLink}
      to={to}
      end={to === '/'}
      px={3}
      py={2}
      borderRadius="md"
      fontWeight="medium"
      _hover={{ textDecoration: 'none', bg: 'blackAlpha.50' }}
      sx={{
        '&.active': { bg: 'brand.50', color: 'brand.700' },
      }}
    >
      {label}
    </ChakraLink>
  );
}

export function Layout() {
  const { role, setRole } = useRole();

  return (
    <Box minH="100vh">
      <Box bg="white" borderBottomWidth="1px" borderColor="gray.200" position="sticky" top={0} zIndex={10}>
        <Container maxW="7xl" py={3}>
          <Flex align="center" gap={6} wrap="wrap">
            <HStack spacing={3}>
              <Box w={3} h={10} bg="brand.500" borderRadius="full" />
              <Box>
                <Heading size="md" letterSpacing="tight">
                  Nepal Mini Payroll
                </Heading>
                <Text fontSize="xs" color="gray.500">
                  Himalayan Gears Pvt. Ltd. · demo data
                </Text>
              </Box>
            </HStack>
            <HStack spacing={1}>
              {navItems
                .filter((item) => !item.adminOnly || role === 'admin')
                .map((item) => (
                  <NavItem key={item.to} to={item.to} label={item.label} />
                ))}
            </HStack>
            <Spacer />
            <HStack spacing={3}>
              <Badge colorScheme={role === 'admin' ? 'purple' : 'green'} px={2} py={1} borderRadius="md">
                {role === 'admin' ? 'Admin role' : 'Employee role'}
              </Badge>
              <Select
                size="sm"
                width="150px"
                value={role}
                aria-label="Active role"
                onChange={(event) => setRole(event.target.value as Role)}
              >
                <option value="employee">Employee view</option>
                <option value="admin">Admin view</option>
              </Select>
            </HStack>
          </Flex>
        </Container>
      </Box>

      <Container maxW="7xl" py={8}>
        <Outlet />
      </Container>

      <Box as="footer" py={6} textAlign="center" color="gray.500" fontSize="sm">
        A demo payroll system. Amounts are integer paisa; the secret component is visible only to the
        admin role.
      </Box>
    </Box>
  );
}
