import {
  Badge,
  Box,
  Button,
  Container,
  Drawer,
  DrawerBody,
  DrawerCloseButton,
  DrawerContent,
  DrawerHeader,
  DrawerOverlay,
  Flex,
  HStack,
  Heading,
  IconButton,
  Select,
  Spacer,
  Text,
  useBreakpointValue,
  useDisclosure,
} from '@chakra-ui/react';
import { HamburgerIcon } from '@chakra-ui/icons';
import { NavLink as RouterNavLink, Outlet } from 'react-router-dom';
import { useRole } from '../lib/role';
import type { Role } from '../lib/types';

const navItems: Array<{ to: string; label: string }> = [
  { to: '/', label: 'Payroll periods' },
  { to: '/employees', label: 'Employees' },
  { to: '/policy', label: 'Policy' },
];

function NavLinks({ onClick }: { onClick?: () => void }) {
  return (
    <>
      {navItems.map((item) => (
        <Button
          key={item.to}
          as={RouterNavLink}
          to={item.to}
          end={item.to === '/'}
          variant="ghost"
          size="sm"
          onClick={onClick}
          _activeLink={{ bg: 'brand.50', color: 'brand.700' }}
          justifyContent="flex-start"
        >
          {item.label}
        </Button>
      ))}
    </>
  );
}

export function Layout() {
  const { role, setRole } = useRole();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const isMobile = useBreakpointValue({ base: true, md: false });

  return (
    <Box minH="100vh" bg="gray.50">
      <Box
        bg="white"
        borderBottomWidth="1px"
        borderColor="gray.200"
        position="sticky"
        top={0}
        zIndex={20}
        boxShadow="sm"
      >
        <Container maxW="7xl" py={{ base: 2, md: 3 }}>
          <Flex align="center" gap={{ base: 2, md: 6 }} wrap="nowrap">
            <HStack spacing={3} flexShrink={0}>
              <Box
                w={9}
                h={9}
                bg="brand.600"
                color="white"
                borderRadius="lg"
                display="flex"
                alignItems="center"
                justifyContent="center"
                fontWeight="bold"
                fontSize="sm"
                boxShadow="sm"
              >
                HG
              </Box>
              <Box display={{ base: 'none', sm: 'block' }}>
                <Heading size="sm" letterSpacing="tight" color="gray.800">
                  Nepal Mini Payroll
                </Heading>
                <Text fontSize="xs" color="gray.500">
                  Himalayan Gears Pvt. Ltd.
                </Text>
              </Box>
            </HStack>

            {!isMobile && (
              <HStack spacing={1}>
                <NavLinks />
              </HStack>
            )}

            <Spacer />

            <HStack spacing={2} flexShrink={0}>
              <Badge
                colorScheme={role === 'admin' ? 'purple' : 'green'}
                px={2}
                py={1}
                borderRadius="md"
                display={{ base: 'none', sm: 'inline-flex' }}
              >
                {role === 'admin' ? 'Admin' : 'Employee'}
              </Badge>
              <Select
                size="sm"
                width={{ base: '120px', md: '150px' }}
                value={role}
                aria-label="Active role"
                onChange={(event) => setRole(event.target.value as Role)}
              >
                <option value="employee">Employee view</option>
                <option value="admin">Admin view</option>
              </Select>
              {isMobile && (
                <IconButton
                  aria-label="Open navigation"
                  icon={<HamburgerIcon />}
                  size="sm"
                  variant="outline"
                  onClick={onOpen}
                />
              )}
            </HStack>
          </Flex>
        </Container>
      </Box>

      <Drawer isOpen={isOpen} placement="right" onClose={onClose}>
        <DrawerOverlay />
        <DrawerContent>
          <DrawerCloseButton />
          <DrawerHeader>Navigate</DrawerHeader>
          <DrawerBody>
            <Flex direction="column" gap={2}>
              <NavLinks onClick={onClose} />
            </Flex>
          </DrawerBody>
        </DrawerContent>
      </Drawer>

      <Container maxW="7xl" py={{ base: 4, md: 8 }} px={{ base: 3, md: 6 }}>
        <Outlet />
      </Container>

      <Box as="footer" py={6} textAlign="center" color="gray.500" fontSize="sm" px={4}>
        Nepal mini payroll · amounts in integer paisa · secret component visible only to admin.
      </Box>
    </Box>
  );
}
