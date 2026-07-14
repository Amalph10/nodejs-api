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
  
   ```bash
   docker build -t nodejs-api .
   docker images 
   docker tag nodejs-api:latest amalph10/nodejs-api:1
   ```

2. **Log in to DockerHub:**
   ```bash
   docker login
   ```

3. **Push the Image:**
   ```bash
   docker push amalph10/nodejs-api:1
   ```



## 4. Self-Hosted Kubernetes Setup (using kubeadm)

* **Installation Guide**: [BashOps Kubernetes Installation Guide](https://github.com/BashOps/kubernetes_install/blob/main/kubeadm/README.md)
# Kubeadm Installation Guide

### Prerequisites
Ubuntu OS (Xenial or later)
sudo privileges
Internet access
t2.medium instance type or higher

### AWS Setup
Ensure that all instances are in the same Security Group.
Expose port 6443 in the Security Group to allow worker nodes to join the cluster.
Expose port 22 in the Security Group to allows SSH access to manage the instance.

# Execute on Both "Master" & "Worker" Nodes

Disable Swap: Required for Kubernetes to function correctly.
```
sudo swapoff -a
```

### Load Necessary Kernel Modules: Required for Kubernetes networking.

Explicitly loads kernel modules (overlay and br_netfilter) and sets sysctl parameters for networking.

1. Ensures proper networking for Kubernetes.

2. Includes commands to verify the loaded modules.

```
cat <<EOF | sudo tee /etc/modules-load.d/k8s.conf
overlay
br_netfilter
EOF

sudo modprobe overlay
sudo modprobe br_netfilter
```
### Set Sysctl Parameters: Helps with networking.
```
cat <<EOF | sudo tee /etc/sysctl.d/k8s.conf
net.bridge.bridge-nf-call-iptables  = 1
net.bridge.bridge-nf-call-ip6tables = 1
net.ipv4.ip_forward                 = 1
EOF

sudo sysctl --system
lsmod | grep br_netfilter
lsmod | grep overlay
```
### Install Containerd:
```
sudo apt-get update
sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo \"$VERSION_CODENAME\") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update
sudo apt-get install -y containerd.io

containerd config default | sed -e 's/SystemdCgroup = false/SystemdCgroup = true/' -e 's/sandbox_image = "registry.k8s.io\/pause:3.6"/sandbox_image = "registry.k8s.io\/pause:3.9"/' | sudo tee /etc/containerd/config.toml

sudo systemctl restart containerd
sudo systemctl status containerd
```

### Install Kubernetes Components:
```
sudo apt-get update
sudo apt-get install -y apt-transport-https ca-certificates curl gpg

curl -fsSL https://pkgs.k8s.io/core:/stable:/v1.29/deb/Release.key | sudo gpg --dearmor -o /etc/apt/keyrings/kubernetes-apt-keyring.gpg

echo 'deb [signed-by=/etc/apt/keyrings/kubernetes-apt-keyring.gpg] https://pkgs.k8s.io/core:/stable:/v1.29/deb/ /' | sudo tee /etc/apt/sources.list.d/kubernetes.list

sudo apt-get update
sudo apt-get install -y kubelet kubeadm kubectl
sudo apt-mark hold kubelet kubeadm kubectl
```

# Execute ONLY on the "Master" Node

### Initialize the Cluster:

```
sudo kubeadm init
```

### Set Up Local kubeconfig:

```
mkdir -p "$HOME"/.kube
sudo cp -i /etc/kubernetes/admin.conf "$HOME"/.kube/config
sudo chown "$(id -u)":"$(id -g)" "$HOME"/.kube/config
```

## Install a Network Plugin (Calico):
### calico/weave/Flannel

```
kubectl apply -f https://raw.githubusercontent.com/projectcalico/calico/v3.26.0/manifests/calico.yaml
```

### Generate Join Command:

```
kubeadm token create --print-join-command
```

Copy this generated token for next command.



# Execute on ALL of your Worker Nodes

1. Perform pre-flight checks:
```
sudo kubeadm reset
```

Paste the join command you got from the master node and append --v=5 at the end:

```
sudo kubeadm join <private-ip-of-control-plane>:6443 --token <token> --discovery-token-ca-cert-hash sha256:<hash> --cri-socket "unix:///run/containerd/containerd.sock" --v=5
```

# Verify Cluster Connection
```
kubectl get nodes
```

---

## 5. Kubernetes Deployment Steps

With the cluster up and the Docker image pushed, you are ready to deploy the Node.js REST API.

1. **Update Deployment Manifest:**
   Open [k8s/deployment.yaml](file:///c:/Users/user/Desktop/nodejs-app/k8s/deployment.yaml) and replace `<YOUR_DOCKERHUB_USERNAME>` with your actual DockerHub username.
   ```yaml
   image: <YOUR_DOCKERHUB_USERNAME>/nodejs-api:1
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

### Issue 1: Kubernetes Pods stuck in `ImagePullBackOff`
* **Symptom**: Pod status showed `ImagePullBackOff` or `ErrImagePull`.
* **Cause**: The deployment manifest specified `amalph10/nodejs-api:latest`, but the Docker image was pushed to Docker Hub with the tag `1` (i.e. `amalph10/nodejs-api:1`).
* **Resolution**: Updated `k8s/deployment.yaml` to target the exact tag `amalph10/nodejs-api:1`, and pulled the updated code to the master node before re-deploying.

### Issue 2: Master Node unable to fetch logs (`dial tcp 10250: i/o timeout`)
* **Symptom**: `kubectl logs` failed with `dial tcp 172.31.42.98:10250: i/o timeout`.
* **Cause**: The master node could not communicate with the worker node's `kubelet` API port (`10250`) due to local UFW rules or AWS Security Group constraints blocking node-to-node communication.
* **Resolution**: Disabled the local firewall (`sudo ufw disable`) on both the master and worker nodes, and ensured the AWS Security Group allows all internal subnet traffic.

### Issue 3: Localhost NodePort `30001` Timeout on Master Node
* **Symptom**: `curl http://localhost:30001/` returned a connection timeout.
* **Cause**: In multi-node clusters, the master node does not host application pods and lacks appropriate internal CNI routing paths if overlay network ports (VXLAN/UDP `4789`) are blocked in the cloud firewall.
* **Resolution**: Verified routing by querying the Worker Node private IP directly (`curl http://172.31.42.98:30001/`), which returned a successful JSON response. For public access, the Worker Node's Public IP is used on port `30001` with the respective security group port opened.


