# Node.js REST API & Kubernetes Deployment Guide

This repository contains a simple, production-ready Node.js REST API, containerized using Docker, and ready for deployment on a self-hosted Kubernetes cluster (e.g., set up via `kubeadm` on Ubuntu).

---

## Repository Structure

```text
├── k8s/
│   ├── deployment.yaml   # Kubernetes Deployment manifest (3 replicas)
│   └── service.yaml      # Kubernetes NodePort Service manifest (Port 30001)
├── .dockerignore         # Docker context exclusions
├── .gitignore            # Git exclusion file (ignores node_modules)
├── Dockerfile            # Multi-stage Docker image definition
├── index.js              # Express REST API application
├── package.json          # Node.js dependencies & scripts
└── README.md             # Setup, security, and deployment documentation
```

---

## 1. Application & Local Verification

The application is written in Node.js using Express. It exposes three primary endpoints:
* `GET /`: Returns welcome message, hostname, system platform, server uptime, and timestamp (useful for verifying load balancing).
* `GET /api/health`: Health status endpoint for Kubernetes liveness probe.
* `GET /api/items`: Returns a sample JSON list of data items.

### Running Locally
To test the API locally, make sure Node.js (version 18+) is installed, then run:

```bash
# Install dependencies
npm install

# Start the server
npm start
```

Once running, you can verify it in your browser or via `curl`:
```bash
curl http://localhost:3000/
curl http://localhost:3000/api/health
curl http://localhost:3000/api/items
```

---

## 2. Docker Setup (Build & Push)

A multi-stage `Dockerfile` is provided. It installs only production dependencies in the builder stage, and copy them to the final lightweight Alpine runner image. The application runs under a non-root system user (`node`).

### Step-by-Step Instructions

1. **Build the Docker Image:**
   Replace `<YOUR_DOCKERHUB_USERNAME>` with your actual DockerHub username.
   ```bash
   docker build -t <YOUR_DOCKERHUB_USERNAME>/nodejs-rest-api:latest .
   ```

2. **Test Container Locally (Optional):**
   ```bash
   docker run -d -p 3000:3000 --name nodejs-api-test <YOUR_DOCKERHUB_USERNAME>/nodejs-rest-api:latest
   curl http://localhost:3000/
   docker rm -f nodejs-api-test
   ```

3. **Log in to DockerHub:**
   ```bash
   docker login
   ```

4. **Push the Image:**
   ```bash
   docker push <YOUR_DOCKERHUB_USERNAME>/nodejs-rest-api:latest
   ```

---

## 3. Server Security (SSH Key-Based Authentication)

Before installing the Kubernetes cluster, secure your Ubuntu server (EC2 instance or VM) by disabling password login and enforcing SSH key-based authentication.

### Enforce SSH Key-Based Auth

1. **Generate SSH Key Pair** (on your local machine, if you don't have one):
   ```bash
   ssh-keygen -t ed25519 -C "admin-key"
   ```

2. **Copy the Public Key to the VM:**
   ```bash
   ssh-copy-id -i ~/.ssh/id_ed25519.pub ubuntu@<YOUR_VM_IP>
   ```

3. **Log into the VM via SSH Key:**
   Confirm you can log in without typing your password:
   ```bash
   ssh -i ~/.ssh/id_ed25519 ubuntu@<YOUR_VM_IP>
   ```

4. **Disable Password Authentication on Server:**
   Open the SSH daemon configuration file:
   ```bash
   sudo nano /etc/ssh/sshd_config
   ```
   Modify or add the following settings (make sure they are not commented out with `#`):
   ```text
   PubkeyAuthentication yes
   PasswordAuthentication no
   ChallengeResponseAuthentication no
   KbdInteractiveAuthentication no
   ```
   Save the file and exit.

5. **Restart SSH Daemon:**
   ```bash
   sudo systemctl restart ssh
   ```
   *Caution: Do not close your active SSH terminal until you have tested logging in from a new, separate terminal window to verify key-based access still works.*

---

## 4. Self-Hosted Kubernetes Setup (using kubeadm)

Follow these steps to set up a Kubernetes cluster on your self-managed Ubuntu server. These setup instructions are based on the [BashOps Kubernetes Installation Guide](https://github.com/BashOps/kubernetes_install/blob/main/kubeadm/README.md):

### A. Pre-requisites (Run on all nodes)
Run the following commands as root or using `sudo` to configure system prerequisites:

```bash
# Disable Swap (required by Kubernetes)
sudo swapoff -a
sudo sed -i '/ swap / s/^\(.*\)$/#\1/g' /etc/fstab

# Forward IPv4 and let iptables see bridged traffic
cat <<EOF | sudo tee /etc/modules-load.d/k8s.conf
overlay
br_netfilter
EOF

sudo modprobe overlay
sudo modprobe br_netfilter

cat <<EOF | sudo tee /etc/sysctl.d/k8s.conf
net.bridge.bridge-nf-call-iptables  = 1
net.bridge.bridge-nf-call-ip6tables = 1
net.ipv4.ip_forward                 = 1
EOF

sudo sysctl --system
```

### B. Install Container Runtime (containerd)
```bash
# Install containerd
sudo apt-get update
sudo apt-get install -y containerd

# Create default containerd config
sudo mkdir -p /etc/containerd
containerd config default | sudo tee /etc/containerd/config.toml >/dev/null

# Enable SystemdCgroup in containerd config
sudo sed -i 's/SystemdCgroup = false/SystemdCgroup = true/g' /etc/containerd/config.toml

# Restart containerd
sudo systemctl restart containerd
sudo systemctl enable containerd
```

### C. Install kubeadm, kubelet, and kubectl
```bash
sudo apt-get update && sudo apt-get install -y apt-transport-https ca-certificates curl gpg

# Download the public signing key for the Kubernetes package repositories
sudo mkdir -p -m 755 /etc/apt/keyrings
curl -fsSL https://pkgs.k8s.io/core:/stable:/v1.30/deb/Release.key | sudo gpg --dearmor -o /etc/apt/keyrings/kubernetes-apt-keyring.gpg

# Add the appropriate Kubernetes apt repository
echo 'deb [signed-by=/etc/apt/keyrings/kubernetes-apt-keyring.gpg] https://pkgs.k8s.io/core:/stable:/v1.30/deb/ /' | sudo tee /etc/apt/sources.list.d/kubernetes.list

# Update package index and install packages
sudo apt-get update
sudo apt-get install -y kubelet kubeadm kubectl
sudo apt-mark hold kubelet kubeadm kubectl
```

### D. Initialize Control Plane (Run ONLY on Master node)
```bash
sudo kubeadm init --pod-network-cidr=192.168.0.0/16
```
Upon success, configure standard kubeconfig for your non-root user (e.g. `ubuntu`):
```bash
mkdir -p $HOME/.kube
sudo cp -i /etc/kubernetes/admin.conf $HOME/.kube/config
sudo chown $(id -u):$(id -g) $HOME/.kube/config
```

### E. Install Pod Network Add-on (CNI)
Install Calico network plugin:
```bash
kubectl create -f https://raw.githubusercontent.com/projectcalico/calico/v3.28.0/manifests/tigera-operator.yaml
kubectl create -f https://raw.githubusercontent.com/projectcalico/calico/v3.28.0/manifests/custom-resources.yaml
```

### F. Allow Scheduling on Single-Node Cluster (Optional)
If you are running a single-node cluster (e.g. testing on one VM), untaint the node to schedule application pods:
```bash
kubectl taint nodes --all node-role.kubernetes.io/control-plane-
```

### G. Verify Cluster Status
Check if the control plane node is ready:
```bash
kubectl get nodes
```

---

## 5. Kubernetes Deployment Steps

With the cluster up and the Docker image pushed, you are ready to deploy the Node.js REST API.

1. **Update Deployment Manifest:**
   Open [k8s/deployment.yaml](file:///c:/Users/user/Desktop/nodejs-app/k8s/deployment.yaml) and replace `<YOUR_DOCKERHUB_USERNAME>` with your actual DockerHub username.
   ```yaml
   image: <YOUR_DOCKERHUB_USERNAME>/nodejs-rest-api:latest
   ```

2. **Deploy the Manifests:**
   Apply the Kubernetes deployment and service configurations:
   ```bash
   kubectl apply -f k8s/deployment.yaml
   kubectl apply -f k8s/service.yaml
   ```

3. **Verify Deployment & Services:**
   Check that your pods are running and the NodePort service is active:
   ```bash
   kubectl get pods -o wide
   kubectl get services nodejs-rest-api-service
   ```

---

## 6. Accessing the Application

The NodePort service is configured to bind to port **30001** on your VM's external IP address.
To access it:

1. Open port `30001` in your VM provider's security group/firewall (e.g., AWS Security Group, GCP Firewall Rules, or local UFW).
2. Direct your browser or `curl` to:
   * **Root Info:** `http://<YOUR_VM_IP>:30001/`
   * **Health Check:** `http://<YOUR_VM_IP>:30001/api/health`
   * **REST Endpoint:** `http://<YOUR_VM_IP>:30001/api/items`

---

## 7. Submission Deliverables Checklists

Please run the following commands on your cluster to capture the required screenshots for submission:

1. **Kubectl Pods Status:**
   ```bash
   kubectl get pods -o wide
   ```
   *Take a screenshot of the command output, confirming all 3 replicas of `nodejs-rest-api` are running (`STATUS: Running`).*

2. **Kubectl Services Status:**
   ```bash
   kubectl get services nodejs-rest-api-service
   ```
   *Take a screenshot showing port mapping `80:30001/TCP` and the service metadata.*

3. **Live Web Browser Verification:**
   *Navigate to `http://<YOUR_VM_IP>:30001/` in your web browser or run:*
   ```bash
   curl http://<YOUR_VM_IP>:30001/
   ```
   *Take a screenshot showing the returned JSON response containing the message, server uptime, and container hostname.*

---

## 8. Troubleshooting & Resolutions (Interview Log)

Here is a log of the real-world cluster issues encountered during this setup and how they were systematically resolved:

### Issue 1: GitHub Remote Push Denied (403 Forbidden)
* **Symptom**: `remote: Permission to Amalph10/nodejs-api.git denied to Abhilashph123.`
* **Cause**: The local Git configuration was caching credentials of another user (`Abhilashph123`) in the Windows Credential Manager.
* **Resolution**: 
  1. Updated the Git remote origin to include the correct account username:
     ```bash
     git remote set-url origin https://Amalph10@github.com/Amalph10/nodejs-api.git
     ```
  2. Soft-reset the git commits to clear the author history and recommitted the files under the correct Git identity (`Amalph10`), ensuring clean attribution.

### Issue 2: Kubernetes Pods stuck in `ImagePullBackOff`
* **Symptom**: Pod status showed `ImagePullBackOff` or `ErrImagePull`.
* **Cause**: The deployment manifest specified `amalph10/nodejs-api:latest`, but the Docker image was pushed to Docker Hub with the tag `1` (i.e. `amalph10/nodejs-api:1`).
* **Resolution**: Updated `k8s/deployment.yaml` to target the exact tag `amalph10/nodejs-api:1`, and pulled the updated code to the master node before re-deploying.

### Issue 3: Master Node unable to fetch logs (`dial tcp 10250: i/o timeout`)
* **Symptom**: `kubectl logs` failed with `dial tcp 172.31.42.98:10250: i/o timeout`.
* **Cause**: The master node could not communicate with the worker node's `kubelet` API port (`10250`) due to local UFW rules or AWS Security Group constraints blocking node-to-node communication.
* **Resolution**: Disabled the local firewall (`sudo ufw disable`) on both the master and worker nodes, and ensured the AWS Security Group allows all internal subnet traffic.

### Issue 4: Localhost NodePort `30001` Timeout on Master Node
* **Symptom**: `curl http://localhost:30001/` returned a connection timeout.
* **Cause**: In multi-node clusters, the master node does not host application pods and lacks appropriate internal CNI routing paths if overlay network ports (VXLAN/UDP `4789`) are blocked in the cloud firewall.
* **Resolution**: Verified routing by querying the Worker Node private IP directly (`curl http://172.31.42.98:30001/`), which returned a successful JSON response. For public access, the Worker Node's Public IP is used on port `30001` with the respective security group port opened.


