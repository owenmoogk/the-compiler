import {
  ActionIcon,
  Avatar,
  Badge,
  Button,
  Flex,
  Group,
  Menu,
  Text,
  Tooltip,
  useMantineColorScheme,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { FaGithub, FaRegMoon } from 'react-icons/fa';
import { FiLogOut } from 'react-icons/fi';
import { Link } from 'react-router';

import { loginUrl } from '@api/auth';
import { errorMessage } from '@api/client';
import { REPO_URL } from '@global/config';
import { useSession } from '@global/session';

import classes from './HeaderMenu.module.css';

function UserMenu() {
  const { session, me, logout } = useSession();

  if (session.status === 'loading') return null;
  if (session.status === 'offline') {
    return (
      <Tooltip label="The editing server is offline. Bookmarks are read-only.">
        <Badge variant="outline" color="gray">
          Read-only
        </Badge>
      </Tooltip>
    );
  }
  if (!me) {
    return (
      <Button component="a" href={loginUrl()} size="xs" variant="default">
        Sign in
      </Button>
    );
  }

  return (
    <Menu position="bottom-end" withinPortal>
      <Menu.Target>
        <Group gap="2xs" style={{ cursor: 'pointer' }}>
          <Avatar src={me.avatarUrl || null} size="sm" radius="xl">
            {me.login.slice(0, 2).toUpperCase()}
          </Avatar>
        </Group>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>
          Signed in as <b>{me.login}</b>
        </Menu.Label>
        {!me.canEdit && (
          <Text size="xs" c="dimmed" px="sm" pb="xs" maw={220}>
            Only the site owner can edit.
          </Text>
        )}
        <Menu.Item
          leftSection={<FiLogOut />}
          onClick={() =>
            void logout().catch((error: unknown) =>
              notifications.show({ color: 'red', message: errorMessage(error) })
            )
          }
        >
          Sign out
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

export default function Nav() {
  const colorScheme = useMantineColorScheme();

  return (
    <Flex
      className={classes.header}
      align="center"
      justify="space-between"
      px="xl"
    >
      <Link to="/" className={classes.link} style={{ borderRadius: '5px' }}>
        <Text fw={700} size="md">
          The Compiler
        </Text>
      </Link>
      <Group gap="sm">
        <UserMenu />
        <Tooltip label="Source on GitHub">
          <ActionIcon
            component="a"
            href={REPO_URL}
            target="_blank"
            variant="transparent"
            color="var(--mantine-color-text)"
            aria-label="Source on GitHub"
          >
            <FaGithub size="1.25em" />
          </ActionIcon>
        </Tooltip>
        <ActionIcon
          onClick={colorScheme.toggleColorScheme}
          variant="transparent"
          color="var(--mantine-color-text)"
          aria-label="Toggle dark mode"
        >
          <FaRegMoon size="1.25em" />
        </ActionIcon>
      </Group>
    </Flex>
  );
}
