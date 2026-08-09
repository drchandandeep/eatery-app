// navigation/index.js
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { ActivityIndicator, View, Text } from 'react-native';

import { colors } from '../theme';
import { useAuth } from '../context/AuthContext';

import LoginScreen from '../screens/LoginScreen';
import SignupScreen from '../screens/SignupScreen';
import StoreRegisterScreen from '../screens/StoreRegisterScreen';
import MenuScreen from '../screens/MenuScreen';
import ItemDetailScreen from '../screens/ItemDetailScreen';
import CartScreen from '../screens/CartScreen';
import CheckoutScreen from '../screens/CheckoutScreen';
import OrderTrackingScreen from '../screens/OrderTrackingScreen';
import OrderHistoryScreen from '../screens/OrderHistoryScreen';
import AccountScreen from '../screens/AccountScreen';
import AdminDashboardScreen from '../screens/AdminDashboardScreen';
import AdminOrdersScreen from '../screens/AdminOrdersScreen';

const AuthStack = createNativeStackNavigator();
const RootStack = createNativeStackNavigator();
const Tabs = createBottomTabNavigator();

const screenOptions = {
  headerStyle: { backgroundColor: colors.bg },
  headerTintColor: colors.text,
  headerShadowVisible: false,
  contentStyle: { backgroundColor: colors.bg },
};

function TabIcon({ label, focused }) {
  return (
    <Text style={{ fontSize: 11, fontWeight: '700', color: focused ? colors.accent : colors.textMuted }}>
      {label}
    </Text>
  );
}

function MainTabs() {
  const { user } = useAuth();
  return (
    <Tabs.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarShowLabel: false,
      }}
    >
      <Tabs.Screen
        name="MenuHome"
        component={MenuScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon label="MENU" focused={focused} /> }}
      />
      <Tabs.Screen
        name="OrderHistory"
        component={OrderHistoryScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon label="ORDERS" focused={focused} /> }}
      />
      {user?.role === 'store_admin' && (
        <Tabs.Screen
          name="AdminDashboard"
          component={AdminDashboardScreen}
          options={{ tabBarIcon: ({ focused }) => <TabIcon label="ADMIN" focused={focused} /> }}
        />
      )}
      <Tabs.Screen
        name="Account"
        component={AccountScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon label="ACCOUNT" focused={focused} /> }}
      />
    </Tabs.Navigator>
  );
}

function AppStack() {
  return (
    <RootStack.Navigator screenOptions={screenOptions}>
      <RootStack.Screen name="Tabs" component={MainTabs} options={{ headerShown: false }} />
      <RootStack.Screen name="ItemDetail" component={ItemDetailScreen} options={{ title: '' }} />
      <RootStack.Screen name="Cart" component={CartScreen} options={{ headerShown: false }} />
      <RootStack.Screen name="Checkout" component={CheckoutScreen} options={{ headerShown: false }} />
      <RootStack.Screen name="OrderTracking" component={OrderTrackingScreen} options={{ headerShown: false }} />
      <RootStack.Screen name="AdminOrders" component={AdminOrdersScreen} options={{ headerShown: false }} />
    </RootStack.Navigator>
  );
}

function LoginFlow() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Signup" component={SignupScreen} />
      <AuthStack.Screen name="StoreRegister" component={StoreRegisterScreen} />
    </AuthStack.Navigator>
  );
}

export default function RootNavigator() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return <NavigationContainer>{user ? <AppStack /> : <LoginFlow />}</NavigationContainer>;
}
